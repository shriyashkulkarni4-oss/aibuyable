<div align="center">
  <h1>🛍️ AIBuyable</h1>
  <h3>Agentic Commerce Control Center</h3>
  <p><i>Transform traditional e-commerce stores into autonomous, "AI-Buyable" merchants.</i></p>

  <a href="https://aibuyable-inky.vercel.app"><b>🌐 View Live Demo</b></a> • 
  <a href="#-architecture--langgraph-pipeline"><b>Read Architecture</b></a> •
  <a href="#-external-ai-manifest"><b>API Docs</b></a>
  
  <br/><br/>
  
  ![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
  ![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
  ![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
  ![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white)
  ![Razorpay](https://img.shields.io/badge/Razorpay-02042B?style=for-the-badge&logo=razorpay&logoColor=3395FF)

</div>

---

## ⚡ The Problem

As AI agents (like ChatGPT, Claude, and custom shopping bots) become more advanced, users will increasingly delegate their shopping tasks to AI. However, traditional e-commerce stores are built for *human* eyes (HTML, CSS), not for autonomous agents. 

If an AI tries to negotiate a discount or buy a product for a user today, there is no standard protocol, no safety boundary for the merchant, and no native API for the AI to seamlessly execute the transaction.

## 🎯 The Solution: AIBuyable

**AIBuyable** bridges the gap between traditional merchants and autonomous AI buyers. 

By wrapping a merchant's inventory in a rigorous **LangGraph-powered checkout pipeline**, AIBuyable exposes a unified catalog, strict mathematical guardrails, and a secure checkout API. It allows external AI agents to seamlessly negotiate and purchase products on behalf of users, while keeping merchants strictly in control via an autonomous **Human-in-the-Loop (HITL)** system.

---

## 🚀 Key Features

* 🤖 **Agentic Checkout Pipeline:** Powered by LangGraph, every single transaction—whether from a human or an external AI bot—is autonomously evaluated against the merchant's financial guardrails.
* 🛑 **Human-in-the-Loop (HITL) Inbox:** If an AI agent requests a discount that exceeds the merchant's predefined guardrails, the order is intercepted. It enters a real-time HITL inbox for manual merchant approval or rejection.
* 🌐 **External AI Manifests:** Exposes a `/.well-known/agentic-commerce.json` discovery manifest. Third-party LLMs can instantly read this to know exactly how to negotiate and checkout from the store.
* 🕷️ **Automated Deep Crawling:** Merchants don't need to manually enter products. A built-in web scraper crawls their existing website, extracts product data (prices, images, descriptions), and populates the database instantly.
* 💳 **Razorpay Integration:** Secure, instant generation of Razorpay payment links upon successful guardrail clearance.

---

## 🧠 Architecture & LangGraph Pipeline

The core of AIBuyable is a stateful, directed acyclic graph (DAG) built with **LangGraph**. LLM usage is strictly limited to intent parsing—all money math and guardrail decisions are executed in pure, deterministic Python.

```mermaid
graph TD
    User([User via Chat Widget]) -->|Chat Message| Intent[1. parse_intent]
    External([External LLM via API]) -->|JSON Payload| Price[3. select_and_price]
    
    Intent --> Catalog[2. get_catalog]
    Catalog --> Price
    Price --> Discount[4. check_discount_eligibility]
    Discount --> Guardrails{5. guardrail_check}
    
    Guardrails -->|Safe Limits| AutoApprove(Auto Approve)
    Guardrails -->|Limits Exceeded| HITL(HITL Pending)
    
    AutoApprove --> Razorpay[6. create_razorpay_order]
    HITL --> Inbox[[Merchant HITL Dashboard]]
    
    Inbox -->|Merchant Clicks Approve| Razorpay
    Inbox -->|Merchant Clicks Reject| Cancelled(Order Cancelled)
    
    Razorpay --> Pay([Razorpay Payment URL generated])
    Pay --> Webhook(Payment Webhook)
    Webhook --> Stock[Reduce Stock & Notify Chat]
```

---

## 🔌 External AI Manifest

AIBuyable turns the store into a headless API for other LLMs. External bots can interact with the following endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/agentic-commerce.json` | `GET` | Discovery manifest detailing how an AI can buy from this store. |
| `/api/v1/agentic/catalog` | `GET` | Token-lean, LLM-optimized product catalog. |
| `/api/v1/agentic/guardrails` | `GET` | Upfront disclosure of the merchant's discount limits. |
| `/api/v1/agentic/checkout` | `POST` | Injects the external bot's request directly into the LangGraph pipeline. |

---

## 🛠️ Technology Stack

* **Backend & AI:** Python, FastAPI, LangGraph, LangChain, Google Gemini 2.5 Flash
* **Database:** PostgreSQL (Neon), SQLAlchemy, Alembic
* **Frontend:** React 19, TypeScript, Vite, Tailwind-inspired Custom CSS
* **Payments:** Razorpay API
* **Security:** JWT Authentication, Fernet military-grade encryption for API keys at rest

---

## 📦 Local Setup & Installation

### 1. Clone the Repository
```bash
git clone https://github.com/shriyashkulkarni4-oss/aibuyable.git
cd aibuyable
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt
```
*Copy `.env.example` to `.env` and configure your Database URL, Gemini API Key, and JWT Secrets.*
```bash
uvicorn app.main:app --reload
```
*(Note: The database tables and the default admin account `admin@aibuyable.com` are automatically seeded upon the first successful backend startup).*

### 3. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```

---
<div align="center">
  <i>Built with ❤️ for the AI Commerce Revolution</i>
</div>
