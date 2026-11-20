# 🕒 Cartão de Ponto — PWA

> **Progressive Web App (PWA)** leve, moderno e 100% client-side para controle de ponto diário com validação por geolocalização (GPS), edição de horários e emissão de folha de ponto mensal formatada para impressão.

---

## 📋 Sumário

- [Visão Geral](#-visão-geral)
- [Principais Funcionalidades](#-principais-funcionalidades)
- [Demonstração das Telas](#-demonstração-das-telas)
- [Tecnologias Utilizadas](#-tecnologias-utilizadas)
- [Como Executar Localmente](#-como-executar-localmente)
- [Instalação como Aplicativo (PWA)](#-instalação-como-aplicativo-pwa)
- [Requisitos de Geolocalização](#-requisitos-de-geolocalização)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Privacidade e Armazenamento](#-privacidade-e-armazenamento)
- [Autor](#-autor)

---

## 📖 Visão Geral

O **Cartão de Ponto** foi desenvolvido para solucionar de forma prática o registro de jornada de trabalho sem depender de servidores externos ou sistemas complexos. Ele funciona inteiramente no navegador do dispositivo, oferecendo:

- Validação em tempo real se o trabalhador está dentro do raio permitido do local de trabalho.
- Registro das coordenadas geográficas e precisão do GPS a cada batida de ponto.
- Folha de ponto mensal dividida em quinzenas, pronta para ser impressa ou salva em PDF com resumo de horas trabalhadas, estimativa de horas extras e comprovante detalhado de registros.

---

## ✨ Principais Funcionalidades

### 📍 1. Registro com Geofencing (GPS)
- **Validação de Raio**: O botão de registro só é habilitado se o colaborador estiver dentro da distância máxima configurada do local de trabalho (calculada via fórmula de Haversine).
- **Entrada e Saída Inteligente**: Alterna automaticamente entre entrada e saída com base no número de registros efetuados no dia.
- **Auditoria de Coordenadas**: Guarda latitude, longitude, precisão do sinal em metros e distância exata no momento do ponto, com link direto para o Google Maps.
- **Feedback Tátil**: Vibração de confirmação em dispositivos compatíveis e mensagens de alerta instantâneas (*toasts*).

### 📅 2. Gestão Diária de Batidas ("Dias")
- Visualização de todos os dias do mês selecionado.
- Suporte a até **3 períodos diários** (6 batidas: Entrada 1, Saída 1, Entrada 2, Saída 2, Entrada 3, Saída 3).
- Inclusão ou ajuste manual de batidas passadas ou correções pontuais, com identificação clara entre batidas via GPS e batidas manuais.
- Ações rápidas para preencher "Entrada agora", "Saída agora" ou limpar os lançamentos de um dia específico.

### 📄 3. Espelho de Ponto Pronto para Impressão ("Cartão")
- **Layout Formal**: Modelo de cartão de ponto tradicional com cabeçalho corporativo (Empresa, Colaborador, Matrícula, Função, Setor, Escala e Horários previstos).
- **Divisão em Quinzenas**: 1ª Quinzena (dias 1 a 15) e 2ª Quinzena (dias 16 ao final do mês), com totalizadores individuais de cada período.
- **Cálculo Automático**: Total de horas trabalhadas por dia, total mensal de horas e estimativa de horas extras.
- **Campos Oficiais**: Linhas dedicadas para observações e assinaturas do empregado e do gestor/responsável.
- **Página de Comprovante de Localização**: Folha complementar opcional com a listagem completa de data, hora, coordenadas GPS, precisão e distância de cada marcação.
- **CSS Otimizado para Impressão**: Paginação automática sem quebras indesejadas ao imprimir via `Ctrl + P` ou botão nativo.

### ⚙️ 4. Configurações Customizáveis ("Ajustes")
- Definição do local de trabalho com captura automática das coordenadas pelo GPS atual ou preenchimento manual de latitude/longitude e raio de tolerância (em metros).
- Dados cadastrais do trabalhador e da empresa.
- Definição de horários de expediente e intervalos de refeição para base de cálculo de horas extras.

### 📶 5. Offline-First & PWA
- Totalmente funcional sem conexão com a internet graças ao Service Worker e cache local.
- Pode ser instalado na tela inicial do celular (Android/iOS) ou no desktop (Chrome/Edge) como um aplicativo independente (*standalone*).

---

## 🖥️ Demonstração das Telas

| Aba | Descrição |
| --- | --- |
| **Ponto** | Tela principal com relógio em tempo real, status do GPS (distância e precisão), botão de bater ponto e lista das batidas do dia. |
| **Dias** | Navegação mês a mês com lista dia a dia para conferência e lançamento/edição rápida de períodos. |
| **Cartão** | Folha de ponto completa renderizada, pronta para impressão (`window.print`) com opção de incluir comprovante de geolocalização. |
| **Ajustes** | Formulário para definir local de trabalho, raio permitido e dados do colaborador/empresa. |

---

## 🛠️ Tecnologias Utilizadas

- **HTML5 Semântico**: Estruturação acessível e otimizada para impressão.
- **CSS3 Moderno**: Variáveis CSS, Flexbox, CSS Grid, tipografia fluida e regras dedicadas de `@media print`.
- **Vanilla JavaScript (ES6+)**: Sem frameworks ou dependências externas pesadas, garantindo alta velocidade de carregamento e baixo consumo de memória.
- **Web APIs**:
  - `Geolocation API` (vigilância de posição via `watchPosition` com alta precisão).
  - `Service Worker API` (cache de arquivos e funcionamento offline).
  - `Web App Manifest` (instalação PWA).
  - `localStorage` (persistência de dados localmente no navegador).
  - `Vibration API` (haptic feedback ao registrar ponto).

---

## 🚀 Como Executar Localmente

Como o projeto é puramente estático, basta qualquer servidor HTTP local (ou abrir com ferramentas de desenvolvimento).

> **Atenção**: Para que a Geolocation API funcione no navegador, a aplicação **precisa** ser servida em `localhost`, `127.0.0.1` ou sob um domínio com `HTTPS`.

### Opção 1: Usando Python

```bash
# Python 3
python3 -m http.server 8080
```
Acesse no navegador: `http://localhost:8080`

### Opção 2: Usando Node.js (npx serve ou http-server)

```bash
npx serve .
# ou
npx http-server -p 8080
```

### Opção 3: Extensão Live Server (VS Code)

Basta abrir o diretório no VS Code, clicar com o botão direito em `index.html` e selecionar **"Open with Live Server"**.

---

## 📱 Instalação como Aplicativo (PWA)

### No Android (Google Chrome)
1. Acesse o endereço da aplicação no Chrome.
2. Toque no menu de três pontos no canto superior direito.
3. Selecione **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**.

### No iPhone / iPad (Safari)
1. Acesse a aplicação pelo Safari.
2. Toque no botão de **Compartilhar** (ícone do quadrado com a seta para cima).
3. Role para baixo e selecione **"Adicionar à Tela de Início"**.

### No Computador (Chrome / Edge)
1. Abra a aplicação no navegador.
2. Clique no ícone de instalação na barra de endereços (ao lado da estrela de favoritos) ou no menu do navegador em **"Instalar Cartão de Ponto..."**.

---

## 🛰️ Requisitos de Geolocalização

Para a validação por geolocalização funcionar corretamente:
1. **Ambiente Seguro**: O navegador só libera o GPS sob `https://` ou `http://localhost`.
2. **Permissão de Localização**: Ao abrir a aplicação pela primeira vez, conceda permissão de acesso à localização quando solicitado pelo navegador.
3. **Precisão**: Em ambientes fechados, o GPS pode ter variações de precisão. Ajuste o raio permitido na tela de **Ajustes** (por exemplo, 100 a 200 metros) para evitar bloqueios indevidos.

---

## 📂 Estrutura do Projeto

```text
cartao-ponto/
├── index.html              # Estrutura HTML principal da aplicação e de todas as telas
├── styles.css              # Estilos da interface, design responsivo e folhas de impressão
├── app.js                  # Lógica de negócio, geolocalização, cálculos de horas e UI
├── sw.js                   # Service Worker para suporte offline e cache de assets
├── manifest.webmanifest    # Manifesto PWA com metadados e configuração de inicialização
├── icon.svg                # Ícone vetorial da marca
├── icon-192.png            # Ícone PWA 192x192
├── icon-512.png            # Ícone PWA 512x512
└── README.md               # Documentação do projeto
```

---

## 🔒 Privacidade e Armazenamento

- **100% Local**: Todos os registros de horários, configurações e coordenadas são armazenados exclusivamente no dispositivo do usuário por meio do `localStorage` do navegador sob a chave `cartao-ponto:v1`.
- **Sem Rastreamento Externo**: Nenhuma informação é enviada a servidores ou serviços de terceiros.
- **Backup**: Para gerar backup físico ou digital de qualquer mês, utilize a tela de impressão do Cartão e salve o arquivo como PDF.

---

## 👤 Autor

Desenvolvido por **Marcelo Luiz** ([@Mlluiz39](https://github.com/Mlluiz39)).
