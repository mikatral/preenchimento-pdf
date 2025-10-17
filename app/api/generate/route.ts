// app/api/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as XLSX from "xlsx";
import archiver from "archiver";
import { PassThrough } from "stream";

export const runtime = "nodejs";
export const maxDuration = 60;

function bad(message: string, status = 400) {
  return new NextResponse(JSON.stringify({ ok: false, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseCurrency(val: any): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  let s = String(val).trim().replace(/\s+/g, "");
  if (/,/.test(s) && /\./.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/,/.test(s)) s = s.replace(",", ".");
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}
function formatBRL(n: number): string {
  try {
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
  }
}
function sanitizeFilename(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "_").trim();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    // ===== modelo em /public =====
    const modelPath = String(form.get("modelPath") || "");
    if (!modelPath) return bad("Modelo não informado (modelPath).");
    const modelRes = await fetch(new URL(modelPath, req.url));
    if (!modelRes.ok) return bad(`Falha ao carregar ${modelPath} em /public.`);
    const modelBytes = new Uint8Array(await modelRes.arrayBuffer());

    // ===== mapping =====
    let mapping: any = {};
    try { mapping = JSON.parse(String(form.get("mapping") || "{}")); }
    catch { return bad("Mapping inválido (JSON malformado)."); }
    const pos = mapping?.overlay?.posicoes || {};
    const fontSize = Number(mapping?.overlay?.fontSize || 10);
    if (!Object.keys(pos).length) return bad("Mapping.overlay.posicoes vazio.");

    const nomeBase  = pos["nome"];
    const cpfBase   = pos["cpf"];
    const titBase   = pos["titularidade"];
    const planoBase = pos["plano_1"];  // imprime "TELEMEDICINA"
    const valorBase = pos["valor_1"];
    if (!nomeBase || !cpfBase || !titBase || !planoBase || !valorBase) {
      return bad("Mapping precisa ter: nome, cpf, titularidade, plano_1, valor_1.");
    }

    const headerKeys = ["empresa","mensalidade_data","emissao_data","periodo_data","total_beneficiarios","valor_total"];
    const baseHeader: Record<string, string> = {
      empresa: "", // pode vir do Excel (modo antigo) ou do JSON (novo)
      mensalidade_data: String(form.get("mensalidade_data") || ""),
      emissao_data: String(form.get("emissao_data") || ""),
      periodo_data: String(form.get("periodo_data") || ""),
      total_beneficiarios: "",
      valor_total: "",
    };

    // ===== função que renderiza UM PDF de UMA empresa =====
    async function renderCompanyPDF(empresa: string, rows: Record<string, any>[]) {
      const pdfDoc = await PDFDocument.load(modelBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const LINE_HEIGHT = 20;
      const ITEMS_PER_PAGE = 10;
      const startY = Number(nomeBase[2]);
      const pages = pdfDoc.getPages();

      const total = rows.length;
      const soma = rows.reduce((acc, r) => acc + parseCurrency(r.valor), 0);

      function draw(page: any, text: string, base: any, yOverride?: number) {
        const [/*pageIndexIgnored*/, x, y, align = "left"] = base;
        const yy = yOverride != null ? yOverride : Number(y);
        const w = font.widthOfTextAtSize(text, fontSize);
        let drawX = Number(x);
        if (align === "center") drawX -= w / 2;
        if (align === "right")  drawX -= w;
        page.drawText(text, { x: drawX, y: yy, size: fontSize, font, color: rgb(0, 0, 0) });
      }
      async function addTemplatePage() {
        const tpl = await PDFDocument.load(modelBytes);
        const [copied] = await pdfDoc.copyPages(tpl, [0]);
        pdfDoc.addPage(copied);
        return copied;
      }

      const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
      for (let p = 0; p < totalPages; p++) {
        const start = p * ITEMS_PER_PAGE;
        const end = Math.min(start + ITEMS_PER_PAGE, total);
        const currentPage = p === 0 ? pages[0] : await addTemplatePage();

        const headerValues: Record<string,string> = {
          ...baseHeader,
          empresa,
          total_beneficiarios: String(total),
          valor_total: formatBRL(soma),
        };
        for (const key of headerKeys) if (pos[key]) draw(currentPage, String(headerValues[key] ?? ""), pos[key]);

        for (let i = start; i < end; i++) {
          const r = rows[i];
          const y = startY - (i - start) * LINE_HEIGHT;

          const nome = String(r.nome || "").toUpperCase();
          const cpf  = String(r.cpf  || "");
          const tit  = String(r.titularidade || "");
          const tele = "TELEMEDICINA";
          const valS = typeof r.valor === "number" ? formatBRL(r.valor) : String(r.valor || "");

          draw(currentPage, nome, nomeBase, y);
          draw(currentPage, cpf,  cpfBase,  y);
          draw(currentPage, tit,  titBase,  y);
          draw(currentPage, tele, planoBase, y);
          draw(currentPage, valS, valorBase, y);
        }
      }

      const bytes = await pdfDoc.save();
      const numeroSorteado = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
      const filename = sanitizeFilename(`Demonstrativo - ${empresa} ${numeroSorteado}.pdf`);
      return { filename, bytes };
    }

    // ===== MODO NOVO: receber JSON por empresa =====
    const jsonRowsRaw = form.get("jsonRows");
    const empresaTitulo = String(form.get("empresa") || "");
    if (jsonRowsRaw && empresaTitulo) {
      let rows: any[] = [];
      try {
        rows = JSON.parse(String(jsonRowsRaw) || "[]");
      } catch {
        return bad("jsonRows inválido.");
      }
      // normaliza: { valor:number, nome:string, cpf:string, titularidade:string }
      const norm = rows.map((r) => ({
        valor: parseCurrency(r.VALOR ?? r.valor),
        nome: String(r["NOME_FUNCIONÁRIO"] ?? r["NOME_FUNCIONARIO"] ?? r.nome ?? ""),
        cpf:  String(r.CPF ?? r.cpf ?? ""),
        titularidade: String(r.titularidade ?? r.TITULARIDADE ?? ""),
      }));
      const { filename, bytes } = await renderCompanyPDF(empresaTitulo, norm);
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // ===== MODO ANTIGO: receber 1 Excel com todas empresas (gera PDF ou ZIP) =====
    const fileData = form.get("fileData") as File | null;
    if (!fileData) return bad("Arquivo Excel/CSV ausente (fileData).");

    const buf = Buffer.from(await fileData.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return bad("Planilha vazia ou primeira aba não encontrada.");
    const allRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
    if (!allRows.length) return bad("Nenhuma linha encontrada na planilha.");

    const normKey = (s: string) => s.trim().toLowerCase();
    const cols = Object.keys(allRows[0]).reduce((acc, k) => ({...acc, [normKey(k)]: k}), {} as Record<string,string>);
    const colValor = cols["valor"] || cols["valor (r$)"] || cols["r$"] || "VALOR";
    const colEmpresa = cols["empresa"] || "EMPRESA";
    const colNome = cols["nome_funcionário"] || cols["nome_funcionario"] || "NOME_FUNCIONÁRIO";
    const colCPF = cols["cpf"] || "CPF";
    const colTit = cols["titularidade"] || "titularidade";

    // agrupar
    const groups = new Map<string, any[]>();
    for (const r of allRows) {
      const empresa = String(r[colEmpresa] ?? "").trim();
      if (!groups.has(empresa)) groups.set(empresa, []);
      groups.get(empresa)!.push({
        valor: parseCurrency(r[colValor]),
        nome: String(r[colNome] ?? ""),
        cpf:  String(r[colCPF] ?? ""),
        titularidade: String(r[colTit] ?? ""),
      });
    }

    const companies = Array.from(groups.keys()).filter((k) => k && groups.get(k)!.length);
    if (companies.length === 0) return bad("Não encontrei valores na coluna EMPRESA.");

    if (companies.length === 1) {
      const empresa = companies[0];
      const { filename, bytes } = await renderCompanyPDF(empresa, groups.get(empresa)!);
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const pass = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err: any) => { throw err; });
    archive.pipe(pass);
    for (const empresa of companies) {
      const { filename, bytes } = await renderCompanyPDF(empresa, groups.get(empresa)!);
      archive.append(Buffer.from(bytes), { name: filename });
    }
    await archive.finalize();

    return new NextResponse(pass as any, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="demonstrativos_por_empresa.zip"`,
        "Cache-Control": "no-store",
      },
    });

  } catch (e: any) {
    console.error("Erro /api/generate:", e);
    return bad(`Erro interno: ${String(e?.message || e)}`, 500);
  }
}
