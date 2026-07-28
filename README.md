# Boanerge Finance — App instalável

App de saúde financeira da Boanerge Company. Roda no navegador e pode ser instalado
na tela inicial do celular como um app (PWA).

**Importante:** os dados ficam salvos no navegador de cada aparelho (localStorage).
Não há banco de dados nem sincronização entre dispositivos nesta versão — é o
"caminho rápido". Para dados na nuvem e multi-usuário, use o pacote de produção
(`boanerge-finance-arquitetura.md`).

## 1. Colocar no GitHub

```bash
cd boanerge-app
git init
git add .
git commit -m "Boanerge Finance"
```

Crie um repositório vazio em github.com/new (ex: `boanerge-finance`) e depois:

```bash
git remote add origin https://github.com/SEU_USUARIO/boanerge-finance.git
git branch -M main
git push -u origin main
```

## 2. Publicar na Vercel

1. Acesse vercel.com → **Add New → Project**
2. Importe o repositório `boanerge-finance` do GitHub
3. Framework preset: **Vite** (a Vercel detecta sozinha)
4. Clique em **Deploy**
5. Em 1-2 minutos você recebe uma URL tipo `boanerge-finance.vercel.app`

Não precisa configurar nenhuma variável de ambiente — este app não tem backend.

## 3. Instalar como ícone no celular

**iPhone (Safari):**
1. Abra a URL do app no Safari
2. Toque no ícone de compartilhar (quadrado com seta pra cima)
3. Toque em **Adicionar à Tela de Início**

**Android (Chrome):**
1. Abra a URL do app no Chrome
2. Toque nos três pontinhos (menu)
3. Toque em **Adicionar à tela inicial** (ou vai aparecer um banner automático "Instalar app")

O ícone dourado com "B" em fundo azul-marinho vai aparecer na tela, e o app abre
em tela cheia, sem barra de navegador.

## 4. Rodar localmente antes de publicar (opcional)

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.
