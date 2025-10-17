"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import mapping from "../config/mapping.json";

type Row = {
  VALOR: any;
  EMPRESA: string;
  "NOME_FUNCIONÁRIO"?: string;
  "NOME_FUNCIONARIO"?: string;
  CPF?: string;
  titularidade?: string;
  TITULARIDADE?: string;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [mensalidade, setMensalidade] = useState("");
  const [emissao, setEmissao] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<string>("");

  async function handleGenerate() {
    if (!file) return alert("Envie o Excel/CSV!");
    if (!mensalidade || !emissao || !periodo)
      return alert("Preencha Mensalidade, Emissão e Período.");

    try {
      setProgress(0);
      setStatus("Lendo planilha...");

      // 1) Ler Excel no navegador
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });

      if (!rows.length) {
        alert("Nenhuma linha encontrada.");
        return;
      }

      // 2) Agrupar por EMPRESA
      const groups = new Map<string, Row[]>();
      for (const r of rows) {
        const empresa = String(r.EMPRESA || "").trim();
        if (!empresa) continue;
        if (!groups.has(empresa)) groups.set(empresa, []);
        groups.get(empresa)!.push(r);
      }

      const companies = Array.from(groups.keys());
      if (companies.length === 0) {
        alert("Não encontrei valores na coluna EMPRESA.");
        return;
      }

      // 3) Processar empresa por empresa (atualizando %)
      let done = 0;
      const results: { filename: string; blob: Blob }[] = [];
      setStatus(`Processando ${companies.length} empresa(s)...`);

      for (const empresa of companies) {
        const jsonRows = groups.get(empresa)!;

        const formData = new FormData();
        formData.append("modelPath", "/demonstrativo.pdf");
        formData.append("mapping", JSON.stringify(mapping));
        formData.append("mensalidade_data", mensalidade);
        formData.append("emissao_data", emissao);
        formData.append("periodo_data", periodo);

        // modo JSON (novo): uma empresa por vez
        formData.append("empresa", empresa);
        formData.append("jsonRows", JSON.stringify(jsonRows));

        const res = await fetch("/api/generate", { method: "POST", body: formData });
        if (!res.ok) {
          const text = await res.text();
          try {
            alert(JSON.parse(text).message);
          } catch {
            alert(text || "Erro ao gerar");
          }
          return;
        }

        const blob = await res.blob();
        const disp = res.headers.get("Content-Disposition") || "";
        const match = /filename=\"?([^\";]+)\"?/i.exec(disp);
        const filename = match?.[1] || `Demonstrativo - ${empresa}.pdf`;

        results.push({ filename, blob });

        done += 1;
        setProgress(Math.round((done / companies.length) * 100));
        setStatus(`Gerado: ${done}/${companies.length}`);
      }

      // 4) Download
      if (results.length === 1) {
        // Baixa PDF direto
        const { filename, blob } = results[0];
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        // Monta o ZIP no cliente
        const zip = new JSZip();
        for (const r of results) {
          zip.file(r.filename, r.blob);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "demonstrativos_por_empresa.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      setStatus("Concluído!");
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Erro ao gerar");
      setStatus("Erro");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px 24px",
        background:
          "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 60%, #eef2f7 100%)",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 920,
          background: "#fff",
          borderRadius: 16,
          boxShadow:
            "0 10px 20px rgba(2, 6, 23, 0.06), 0 2px 6px rgba(2, 6, 23, 0.04)",
          padding: 28,
          border: "1px solid #e5e7eb",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#2563eb",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontWeight: 700,
            }}
            aria-hidden
          >
            PDF
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>
              Gerador de Demonstrativos por Empresa
            </h1>
            <p style={{ margin: "4px 0 0", color: "#475569" }}>
              Envie um Excel/CSV com colunas:&nbsp;
              <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 6 }}>
                VALOR | EMPRESA | NOME_FUNCIONÁRIO | CPF | titularidade
              </code>
            </p>
          </div>
        </div>

        {/* Form */}
        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 16,
          }}
        >
          {/* File input */}
          <div
            style={{
              border: "1px dashed #cbd5e1",
              borderRadius: 12,
              padding: 16,
              background: "#fafafa",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: "#0f172a",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "#e2e8f0",
                  color: "#334155",
                  fontSize: 12,
                  fontWeight: 700,
                  display: "grid",
                  placeItems: "center",
                }}
                aria-hidden
              >
                XLS
              </span>
              (Obrigatório) Excel/CSV
            </label>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{
                marginTop: 10,
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: 10,
                width: "100%",
              }}
            />
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>
              Dica: mantenha os cabeçalhos exatamente como acima. Linhas serão
              agrupadas por <b>EMPRESA</b>.
            </p>
          </div>

          {/* Inputs grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <label style={{ display: "block", fontWeight: 600, color: "#0f172a" }}>
                Mensalidade (DD/MM/AAAA)
              </label>
              <input
                type="text"
                value={mensalidade}
                onChange={(e) => setMensalidade(e.target.value)}
                placeholder="01/02/2025"
                style={{
                  marginTop: 6,
                  width: "100%",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 600, color: "#0f172a" }}>
                Emissão (DD/MM/AAAA)
              </label>
              <input
                type="text"
                value={emissao}
                onChange={(e) => setEmissao(e.target.value)}
                placeholder="05/02/2025"
                style={{
                  marginTop: 6,
                  width: "100%",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 600, color: "#0f172a" }}>
                Período: 01/02/2025 a 28/02/2025
              </label>
              <input
                type="text"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                placeholder="01/02/2025 a 28/02/2025"
                style={{
                  marginTop: 6,
                  width: "100%",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              />
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginTop: 4,
            }}
          >
            <button
              onClick={handleGenerate}
              disabled={
                !file ||
                !mensalidade ||
                !emissao ||
                !periodo ||
                (progress > 0 && progress < 100)
              }
              style={{
                minWidth: 220,
                padding: "12px 16px",
                background:
                  "linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                boxShadow:
                  "0 8px 16px rgba(37, 99, 235, 0.25), 0 2px 6px rgba(37, 99, 235, 0.25)",
                cursor: "pointer",
                opacity:
                  !file || !mensalidade || !emissao || !periodo
                    ? 0.6
                    : 1,
              }}
            >
              {progress > 0 && progress < 100 ? "Gerando..." : "Gerar demonstrativos"}
            </button>

            <span style={{ fontSize: 12, color: "#64748b" }}>
              O processo pode levar alguns minutos para arquivos muito grandes.
            </span>
          </div>

          {/* Progress */}
          <div
            style={{
              marginTop: 6,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#334155" }}>{status || "Aguardando..."}</span>
              <span style={{ fontSize: 12, color: "#334155" }}>
                {progress > 0 ? `${progress}%` : ""}
              </span>
            </div>
            <div
              style={{
                height: 10,
                background: "#e2e8f0",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background:
                    "linear-gradient(90deg, #22c55e 0%, #16a34a 100%)",
                  transition: "width .2s",
                }}
              />
            </div>
          </div>

          {/* Footer note */}
          <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
            Após gerar, será feito o download de um PDF por empresa (ou um ZIP se houver várias).
          </div>
        </div>
      </div>
    </main>
  );


}
