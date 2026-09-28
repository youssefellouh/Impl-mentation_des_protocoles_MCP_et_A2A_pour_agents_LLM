# Implémentation des protocoles MCP et A2A pour agents LLM

Ce projet regroupe deux composants principaux :

- un serveur MCP de recherche web,
- une architecture A2A de planification de voyage avec plusieurs agents spécialisés.

## Structure du projet

```text
conférance_mcp_A2A/
├── README.md                    # Documentation générale du projet
├── MCP_Search/                  # Serveur MCP qui expose les outils de recherche web
│   ├── index.js                 # Point d'entrée principal du serveur MCP HTTP
│   ├── package.json             # Dépendances et scripts du serveur MCP
│   ├── README.md                # Documentation spécifique du serveur MCP
│   ├── sse.js                   # Variante de transport SSE
│   └── stdio.js                 # Variante de transport stdio
│
└── A2A/                         # Application A2A de planification de voyage
    ├── README.md                # Documentation spécifique du projet A2A
    ├── package.json             # Dépendances globales du projet A2A
    ├── client/                  # Interface web de l'application
    │   ├── index.html           # Page d'accueil du client
    │   ├── package.json         # Dépendances du client React/Vite
    │   └── src/                 # Code frontend React
    │       ├── App.jsx          # Composant principal de l'interface
    │       ├── App.css          # Styles du client
    │       ├── main.jsx         # Entrée de l'application
    │       └── index.css        # Styles globaux
    └── server/                  # Agents et orchestrateur A2A
        ├── agent-budget.js      # Agent spécialisé dans le budget
        ├── agent-itinerary.js   # Agent spécialisé dans la création d'itinéraire
        ├── agent-search.js      # Agent spécialisé dans la recherche d'informations
        ├── orchestrator.js      # Orchestrateur qui coordonne les agents
        └── package.json         # Dépendances du backend serveur
```

### Rôle de chaque dossier

- `MCP_Search/` : fournit des outils externes au système via le protocole MCP, notamment pour la recherche web.
- `A2A/` : contient l’architecture multi-agents A2A pour la planification de voyages.
- `A2A/client/` : interface utilisateur qui affiche les résultats et le flux d’orchestration.
- `A2A/server/` : implémente les agents intelligents et le coordinateur principal.

## 1. MCP Search Server

Le dossier `MCP_Search` contient un serveur qui expose des outils de recherche web via MCP. Il sert notamment à fournir une source de données externe au agent de recherche.

### Fonctionnement

- Le serveur transforme les requêtes MCP en accès à des services de recherche.
- Il peut être exploité via différentes transports comme SSE, stdio ou WebSocket.
- Il est utilisé par les agents A2A pour obtenir des résultats actuels.

### Démarrage

```bash
cd MCP_Search
npm install
node index.js
```

## 2. Trip Planner A2A

Le dossier `A2A` contient une application multi-agents basée sur le protocole A2A (Agent-to-Agent).

### Objectif

Un orchestrateur central coordonne plusieurs agents spécialisés :

- agent de recherche,
- agent de budget,
- agent d’itinéraire.

Les agents découvrent leurs capacités via des Agent Cards, puis l’orchestrateur leur délègue des tâches de manière asynchrone.

### Architecture

- `client/` : interface utilisateur React/Vite
- `server/` : agents indépendants et orchestrateur

### Modèle LLM

Le modèle utilisé par les agents est configuré via Ollama. Les agents utilisent :

```js
new ChatOllama({ model: "qwen3.5:2b", temperature: 0, think: false })
```

Autrement dit, le projet exploite un modèle local Ollama nommé `qwen3.5:2b`.

### Ports utilisés

| Service | Port |
|--------|------|
| Search Agent | 3010 |
| Budget Agent | 3011 |
| Itinerary Agent | 3012 |
| Orchestrator | 3013 |
| React Client | 5175 |
| MCP Server | 3002 |

## 3. Prérequis

- Node.js 18+
- npm
- Une clé API SerpAPI (pour les projets qui utilisent la recherche web)
- Une clé API Anthropic

## 4. Démarrage rapide

Installez toutes les dépendances du projet depuis la racine :

```bash
npm run install:all
```

Ensuite, allez dans n’importe quel dossier de projet et lancez :

```bash
npm run dev
```

Pour ce dépôt en particulier, la commande la plus simple est :

```bash
cd A2A
npm install
npm run dev
```

Si vous voulez aussi démarrer le serveur MCP séparément :

```bash
cd MCP_Search
npm install
npm start
```

## 5. Points clés du projet

- architecture distribuée en agents autonomes,
- découverte de capacités via Agent Cards,
- orchestration via tâches JSON-RPC,
- intégration de recherche web via MCP,
- interface utilisateur pour visualiser le flux de travail,
- utilisation d’un modèle LLM local via Ollama.

## 6. Remarques

Ce dépôt est une démonstration d’intégration de deux paradigmes :

- le protocole MCP pour accéder à des outils externes,
- le protocole A2A pour permettre à des agents de collaborer entre eux.

Cette combinaison permet de construire un système plus modulaire, plus distribué et plus proche d’une architecture multi-agents réaliste.

## 7. Références internes

- Documentation MCP : `MCP_Search/README.md`
- Documentation A2A : `A2A/README.md`
- Serveur MCP : `MCP_Search/`
- Agents A2A : `A2A/server/`
