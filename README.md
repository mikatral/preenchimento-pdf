# 🧾 Gerador de Demonstrativos por Empresa

![Next.js](https://img.shields.io/badge/Next.js-15.0-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 📖 Sobre o projeto

O **Gerador de Demonstrativos por Empresa** é uma aplicação web que automatiza o preenchimento e geração de **PDFs personalizados** a partir de **planilhas Excel/CSV**.

Cada empresa encontrada na planilha gera automaticamente **um arquivo PDF individual**, com seus respectivos colaboradores e totais calculados.

> Ideal para departamentos financeiros, corretoras e escritórios que precisam gerar demonstrativos mensais com rapidez e precisão.

---

## ✨ Funcionalidades

✅ Upload de planilha Excel/CSV  
✅ Agrupamento automático por **EMPRESA**  
✅ Geração de **um PDF por empresa** (ou ZIP com todos)  
✅ Preenchimento direto sobre o **modelo base PDF**  
✅ Inputs manuais de:
- Data de Mensalidade  
- Data de Emissão  
- Período (Ex.: 01/02/2025 a 28/02/2025)

✅ Barra de progresso (%) em tempo real  
✅ Geração 100% **client-side + serverless (Next.js API)**  

---

## 🧠 Estrutura da Planilha

O sistema lê os seguintes campos:

| COLUNA | DESCRIÇÃO |
|:--------|:-----------|
| **VALOR** | Valor individual do colaborador |
| **EMPRESA** | Razão social ou CNPJ da empresa |
| **NOME_FUNCIONÁRIO** | Nome completo do beneficiário |
| **CPF** | CPF do funcionário |
| **titularidade** | Indica se é Titular ou Dependente |

> Todas as linhas com o mesmo valor de **EMPRESA** serão agrupadas no mesmo PDF.

---

## 🧩 Estrutura do projeto

preenchimento-pdf/
├── app/
│ ├── api/
│ │ └── generate/
│ │ └── route.ts # Lógica principal de geração de PDFs
│ ├── page.tsx # Interface com formulário e barra de progresso
│ └── globals.css # Estilos globais
├── config/
│ └── mapping.json # Mapeamento de coordenadas no PDF
├── public/
│ └── demonstrativo.pdf # Modelo base do PDF a ser preenchido
├── package.json
├── tsconfig.json
└── README.md


---

## ⚙️ Como rodar localmente

### 1️⃣ Clonar o repositório
```bash
git clone https://github.com/SEU_USUARIO/preenchimento-pdf.git
cd preenchimento-pdf

2️⃣ Instalar dependências
npm install

3️⃣ Rodar o servidor local
npm run dev

4️⃣ Acessar no navegador
http://localhost:3000

💻 Como usar o gerador

Faça upload do arquivo Excel/CSV com as colunas:

VALOR | EMPRESA | NOME_FUNCIONÁRIO | CPF | titularidade


Preencha os campos:

Mensalidade (data)

Emissão (data)

Período (intervalo)

Clique em Gerar demonstrativos

Acompanhe o progresso em tempo real

Receba:

PDF único, se houver 1 empresa

ZIP, se houver múltiplas empresas

🧾 Sobre o mapping.json

Arquivo responsável por posicionar cada texto dentro do modelo PDF.
{
  "overlay": {
    "fontSize": 10,
    "posicoes": {
      "empresa": [0, 100, 490, "left"],
      "mensalidade_data": [0, 660, 490, "left"],
      "emissao_data": [0, 100, 461, "left"],
      "periodo_data": [0, 620, 461, "left"],
      "nome": [0, 20, 365, "left"],
      "cpf": [0, 250, 365, "left"],
      "titularidade": [0, 440, 365, "left"],
      "plano_1": [0, 580, 365, "left"],
      "valor_1": [0, 750, 365, "right"],
      "total_beneficiarios": [0, 340, 115, "right"],
      "valor_total": [0, 620, 115, "right"]
    }
  }
}

Formato: [pageIndex, eixoX, eixoY, alinhamento]
Os valores podem ser ajustados conforme o layout do PDF base.

🧱 Tecnologias utilizadas
Tecnologia	Uso
Next.js 15+ (App Router)	Estrutura principal da aplicação
TypeScript	Tipagem e segurança de código
pdf-lib	Edição e preenchimento de PDFs
xlsx (SheetJS)	Leitura e parsing de planilhas Excel
JSZip	Compactação client-side dos PDFs
Archiver	Compactação server-side (modo antigo)

🧩 Como funciona internamente

O frontend:

Lê o Excel/CSV no navegador (via xlsx)

Agrupa as linhas por EMPRESA

Envia uma requisição por empresa ao backend /api/generate

Recebe o PDF de cada empresa e monta o ZIP localmente (JSZip)

O backend (route.ts):

Lê o modelo base (demonstrativo.pdf)

Preenche os campos conforme o mapping.json

Adiciona linhas dinamicamente por colaborador (10 por página)

Calcula totais e soma de valores

Retorna o arquivo PDF pronto (ou ZIP, se houver várias empresas)

🧮 Performance e limite
Tamanho da planilha	Tempo médio de geração
100 linhas	~3s
1.000 linhas	~15s
5.000 linhas	~1 a 2 minutos
10.000+ linhas	Pode exigir divisão em arquivos menores ⚠️

O processo mostra uma barra de progresso (%) e o número de empresas processadas.