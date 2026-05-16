// src/extensions/site/widgets/mips-pay/mips-pay.tsx
// Widget MiPS Payment — sans backend, credentials chiffrés dans les attributs Wix

// ─── Clé de dérivation (doit être identique dans panel.tsx) ───────────────────
const DERIVE_PASSPHRASE = "mips-wix-secure-2025";

// ─── Utilitaires crypto (Web Crypto API natif) ────────────────────────────────
async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("mips-salt-fixed"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptCredentials(data: object): Promise<string> {
  const key = await deriveKey(DERIVE_PASSPHRASE);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(data)),
  );
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptCredentials(
  ciphertext: string,
): Promise<Record<string, string>> {
  const key = await deriveKey(DERIVE_PASSPHRASE);
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ─── Génération d'un id_order unique ──────────────────────────────────────────
function generateOrderId(): string {
  const ts = Date.now().toString().slice(-10);
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `WIX${ts}${rand}`;
}

// ─── Web Component ────────────────────────────────────────────────────────────
class MipsPay extends HTMLElement {
  static get observedAttributes() {
    return [
      "public-key",
      "button-text",
      "button-color",
      "amount",
      "currency",
      "payment-title",
      "request-mode",
      "amount-source",
      "amount-selector",
      "encrypted-credentials",
    ];
  }

  private shadow: ShadowRoot;
  private loading = false;
  private error = "";
  private dynamicAmount = 0;
  private credentialsReady = false;

  private showCustomerForm = false;
  private customerFormErrors: string[] = [];
  private customerInfo = { firstName: "", lastName: "", phone: "", email: "" };

  private showIframe = false;
  private iframeHtml = "";
  private paymentId = "";

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    this.credentialsReady = !!this.encryptedCredentials;
    this.render();
    this.attachEvents();
    await this.updateDynamicAmount();
    this.listenToCartChanges();
  }

  attributeChangedCallback(name: string, _old: string, newVal: string) {
    if (name === "encrypted-credentials" && newVal) {
      this.credentialsReady = true;
    }
    if (name === "amount" && newVal) {
      const p = parseFloat(newVal);
      if (!isNaN(p) && p > 0) this.dynamicAmount = p;
    }
    this.render();
    this.attachEvents();
  }

  // ── Getters ─────────────────────────────────────────────────────────────────
  private get buttonText() {
    return this.getAttribute("button-text") || "Payer avec MiPS";
  }
  private get buttonColor() {
    return this.getAttribute("button-color") || "#2563EB";
  }
  private get fixedAmount() {
    return parseFloat(this.getAttribute("amount") || "0") || 0;
  }
  private get currency() {
    return this.getAttribute("currency") || "MUR";
  }
  private get paymentTitle() {
    return this.getAttribute("payment-title") || "Paiement";
  }
  private get requestMode() {
    return this.getAttribute("request-mode") || "simple";
  }
  private get amountSource() {
    return this.getAttribute("amount-source") || "fixed";
  }
  private get amountSelector() {
    return this.getAttribute("amount-selector") || "";
  }
  private get encryptedCredentials() {
    return this.getAttribute("encrypted-credentials") || "";
  }

  // ── Déchiffrement des credentials au moment du paiement ─────────────────────
  private async getCredentials(): Promise<Record<string, string> | null> {
    if (!this.encryptedCredentials) return null;
    try {
      return await decryptCredentials(this.encryptedCredentials);
    } catch {
      this.error = "Erreur de déchiffrement des credentials.";
      return null;
    }
  }

  // ── Montant dynamique ────────────────────────────────────────────────────────
  private async updateDynamicAmount(): Promise<void> {
    if (this.amountSource === "cart") {
      const { amount } = await this.getWixCartTotal();
      this.dynamicAmount = amount > 0 ? amount : this.fixedAmount;
    } else if (this.amountSource === "selector") {
      this.dynamicAmount = this.getAmountFromSelector() || this.fixedAmount;
    } else {
      this.dynamicAmount = this.fixedAmount;
    }
    this.render();
    this.attachEvents();
  }

  private isInCrossOriginFrame(): boolean {
    try {
      return window.parent !== window && !window.parent.document;
    } catch {
      return true;
    }
  }

  private _cartPending = false;
  private getAmountViaPostMessage(): Promise<number> {
    if (this._cartPending) return Promise.resolve(0);
    this._cartPending = true;
    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this._cartPending = false;
          resolve(0);
        }
      }, 3000);
      const handler = (ev: MessageEvent) => {
        if (ev.data?.type === "wixCart" || ev.data?.cartTotal) {
          if (!resolved) {
            resolved = true;
            this._cartPending = false;
            clearTimeout(timeout);
            window.removeEventListener("message", handler);
            resolve(
              parseFloat(String(ev.data.cartTotal || ev.data.total || 0)) || 0,
            );
          }
        }
      };
      window.addEventListener("message", handler);
      try {
        window.parent.postMessage(
          { type: "getCartTotal", source: "mips-payment" },
          "*",
        );
      } catch {
        this._cartPending = false;
        clearTimeout(timeout);
        resolve(0);
      }
    });
  }

  private async getWixCartTotal(): Promise<{ amount: number }> {
    try {
      if (this.isInCrossOriginFrame()) {
        const amount = await this.getAmountViaPostMessage();
        return { amount: amount > 0 ? amount : this.fixedAmount };
      }
      const w = window as any;
      if (w.wixEmbedsAPI?.getCurrentCart) {
        const cart = await w.wixEmbedsAPI.getCurrentCart();
        const amount = cart?.totals?.total || cart?.totalPrice || 0;
        if (amount > 0) return { amount };
      }
      const selectors = [
        "[data-hook='cart-total']",
        ".cart-total",
        "[data-hook='order-total']",
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const amount = parseFloat(
            (el.textContent || "").replace(/[^0-9.]/g, ""),
          );
          if (!isNaN(amount) && amount > 0) return { amount };
        }
      }
      return { amount: this.fixedAmount };
    } catch {
      return { amount: this.fixedAmount };
    }
  }

  private getAmountFromSelector(): number {
    if (!this.amountSelector) return 0;
    try {
      const el = document.querySelector(this.amountSelector);
      if (el) {
        const v = parseFloat(
          (el.textContent || el.getAttribute("data-amount") || "").replace(
            /[^0-9.-]/g,
            "",
          ),
        );
        return !isNaN(v) && v > 0 ? v : 0;
      }
    } catch {}
    return 0;
  }

  private listenToCartChanges() {
    window.addEventListener("message", async (ev) => {
      if (ev.data?.type === "wixCartUpdated") await this.updateDynamicAmount();
    });
    if (!this.isInCrossOriginFrame() && this.amountSource !== "fixed") {
      new MutationObserver(
        async () => await this.updateDynamicAmount(),
      ).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-total"],
      });
    }
  }

  // ── Gestion du bouton payer ──────────────────────────────────────────────────
  private handlePay() {
    if (!this.credentialsReady) {
      this.error =
        "Configuration MiPS non chargée. Veuillez contacter l'administrateur.";
      this.render();
      this.attachEvents();
      return;
    }
    if (!this.dynamicAmount || this.dynamicAmount <= 0) {
      this.error = "Montant invalide ou panier vide.";
      this.render();
      this.attachEvents();
      return;
    }
    this.error = "";
    this.showCustomerForm = true;
    this.customerFormErrors = [];
    this.render();
    this.attachEvents();
  }

  private async processPayment() {
    const errors: string[] = [];
    if (!this.customerInfo.firstName.trim())
      errors.push("Le prénom est requis");
    if (!this.customerInfo.lastName.trim()) errors.push("Le nom est requis");
    if (!this.customerInfo.phone.trim()) errors.push("Le téléphone est requis");
    else if (!/^[0-9\s+\-]{7,15}$/.test(this.customerInfo.phone.trim()))
      errors.push("Numéro de téléphone invalide");

    if (errors.length > 0) {
      this.customerFormErrors = errors;
      this.render();
      this.attachEvents();
      return;
    }

    this.showCustomerForm = false;
    this.loading = true;
    this.error = "";
    this.render();
    this.attachEvents();

    try {
      // 1. Déchiffrer les credentials
      const creds = await this.getCredentials();
      if (!creds) {
        this.error = "Impossible de charger les credentials MiPS.";
        this.loading = false;
        this.render();
        this.attachEvents();
        return;
      }

      const id_order = generateOrderId();
      this.paymentId = id_order;

      const basicAuth = btoa(
        `${creds.auth_basic_username}:${creds.auth_basic_password}`,
      );

      // 2. Appel direct à l'API MiPS load_payment_zone
      const mipsPayload = {
        authentify: {
          id_merchant: creds.id_merchant,
          id_entity: creds.id_entity,
          id_operator: creds.id_operator,
          operator_password: creds.operator_password,
        },
        order: {
          id_order,
          currency: this.currency,
          amount: this.dynamicAmount,
        },
        request_mode: this.requestMode,
        touchpoint: "web",
        iframe_behavior: {
          custom_redirection_url: `${window.location.origin}/thank-you-page`,
          language: "FR",
        },
        additional_params: [
          {
            param_name: "first_name",
            param_value: this.customerInfo.firstName.trim(),
          },
          {
            param_name: "last_name",
            param_value: this.customerInfo.lastName.trim(),
          },
          {
            param_name: "phone_number",
            param_value: this.customerInfo.phone.trim(),
          },
          {
            param_name: "client_email",
            param_value: this.customerInfo.email.trim(),
          },
        ],
      };

      const res = await fetch("https://api.mips.mu/api/load_payment_zone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${basicAuth}`,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify(mipsPayload),
      });

      const raw = await res.text();
      let mipsData: any;
      try {
        mipsData = JSON.parse(raw);
      } catch {
        throw new Error("Réponse invalide de l'API MiPS");
      }

      const opStatus =
        mipsData.answer?.operation_status || mipsData.operation_status;
      const paymentZoneData = mipsData.answer?.payment_zone_data || null;

      if (opStatus !== "success") {
        throw new Error(
          mipsData.answer?.message || "Erreur création paiement MiPS",
        );
      }

      if (paymentZoneData) {
        this.iframeHtml = paymentZoneData;
        this.showIframe = true;
        this.error = "";
      } else {
        throw new Error("Aucune zone de paiement retournée par MiPS");
      }
    } catch (err: any) {
      this.error = err.message || "Erreur réseau";
    }

    this.loading = false;
    this.render();
    this.attachEvents();
  }

  private getDisplayAmount(): string {
    return `${(this.dynamicAmount || this.fixedAmount).toFixed(2)} ${this.currency}`;
  }

  // ── Rendu & Events ───────────────────────────────────────────────────────────
  private attachEvents() {
    const btn = this.shadow.getElementById("mips-pay-btn");
    if (btn) {
      const newBtn = btn.cloneNode(true);
      btn.parentNode?.replaceChild(newBtn, btn);
      newBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.handlePay();
      });
    }

    const ids: Array<[string, keyof typeof this.customerInfo]> = [
      ["mips-firstname", "firstName"],
      ["mips-lastname", "lastName"],
      ["mips-phone", "phone"],
      ["mips-email", "email"],
    ];
    for (const [id, key] of ids) {
      const el = this.shadow.getElementById(id) as HTMLInputElement | null;
      if (el) {
        el.value = this.customerInfo[key];
        el.addEventListener("input", (e) => {
          this.customerInfo[key] = (e.target as HTMLInputElement).value;
        });
      }
    }

    const confirmBtn = this.shadow.getElementById("mips-confirm-pay");
    if (confirmBtn)
      confirmBtn.addEventListener("click", () => this.processPayment());

    const cancelBtn = this.shadow.getElementById("mips-cancel-form");
    if (cancelBtn)
      cancelBtn.addEventListener("click", () => {
        this.showCustomerForm = false;
        this.customerFormErrors = [];
        this.render();
        this.attachEvents();
      });

    const closeIframeBtn = this.shadow.getElementById("mips-iframe-close");
    if (closeIframeBtn)
      closeIframeBtn.addEventListener("click", () => {
        this.showIframe = false;
        this.iframeHtml = "";
        this.render();
        this.attachEvents();
      });

    window.addEventListener("message", (ev) => {
      if (
        ev.data?.type === "mips_payment_success" ||
        ev.data?.payment_status === "success"
      ) {
        this.handlePaymentSuccess();
      }
      if (
        ev.data?.type === "mips_payment_failed" ||
        ev.data?.payment_status === "failed"
      ) {
        this.handlePaymentFailed();
      }
    });
  }

  private handlePaymentSuccess() {
    this.showIframe = false;
    this.iframeHtml = "";
    this.error = "";
    this.shadow.innerHTML += `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;
        align-items:center;justify-content:center;z-index:9999;">
        <div style="background:#fff;border-radius:16px;padding:32px;text-align:center;max-width:380px;width:90%;">
          <div style="font-size:48px;color:#16a34a;">✓</div>
          <h2 style="margin:12px 0 8px">Paiement réussi !</h2>
          <p style="color:#64748B">Votre paiement de ${this.getDisplayAmount()} a été traité avec succès.</p>
          <p style="font-size:12px;color:#94A3B8">Référence : ${this.paymentId}</p>
        </div>
      </div>`;
  }

  private handlePaymentFailed() {
    this.showIframe = false;
    this.error = "Le paiement a échoué. Veuillez réessayer.";
    this.render();
    this.attachEvents();
  }

  render() {
    const displayAmount = this.getDisplayAmount();
    const color = this.buttonColor;
    const isReady = this.credentialsReady;

    this.shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
        .container { max-width: 400px; width: 100%; }
        .error { color:#DC2626; font-size:13px; margin-bottom:8px; padding:12px;
          background:#FEE2E2; border-radius:6px; text-align:center; }
        .pay-btn {
          width:100%; padding:14px; border-radius:10px; border:none;
          background:${this.loading ? "#93C5FD" : isReady ? color : "#9CA3AF"};
          color:#fff; font-size:16px; font-weight:700;
          cursor:${isReady && !this.loading ? "pointer" : "not-allowed"};
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition:all 0.2s; opacity:${isReady ? 1 : 0.6};
        }
        .pay-btn:hover:not(:disabled) { opacity:0.9; transform:translateY(-1px); }
        .secure-badge { display:flex; align-items:center; justify-content:center;
          gap:6px; margin-top:8px; font-size:11px; color:#94A3B8; }
        .overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5);
          display:flex; align-items:center; justify-content:center; z-index:9999; }
        .modal { background:#fff; border-radius:16px; padding:28px;
          max-width:420px; width:90%; position:relative; }
        .modal-close { position:absolute; top:12px; right:16px; background:none;
          border:none; font-size:20px; cursor:pointer; color:#64748B; }
        .modal h2 { margin:0 0 4px; font-size:18px; text-align:center; }
        .subtitle { color:#64748B; font-size:13px; text-align:center; margin-bottom:16px; }
        .amount-badge { background:#F1F5F9; border-radius:8px; padding:10px;
          text-align:center; margin-bottom:16px; font-size:14px; }
        .amount-badge strong { color:${color}; font-size:18px; }
        .form-row { display:flex; gap:12px; }
        .form-group { margin-bottom:14px; flex:1; }
        .form-group label { display:block; font-size:12px; font-weight:600;
          color:#374151; margin-bottom:5px; }
        .form-group input { width:100%; padding:10px 12px; border:1.5px solid #E2E8F0;
          border-radius:8px; font-size:14px; outline:none; transition:border 0.2s; }
        .form-group input:focus { border-color:${color}; }
        .form-errors { background:#FEE2E2; border-radius:8px; padding:10px 14px;
          margin-bottom:14px; }
        .form-errors p { color:#DC2626; font-size:12px; margin:2px 0; }
        .confirm-btn { width:100%; padding:13px; border-radius:10px; border:none;
          background:${color}; color:#fff; font-size:15px; font-weight:700;
          cursor:pointer; margin-bottom:8px; transition:opacity 0.2s; }
        .confirm-btn:hover { opacity:0.9; }
        .cancel-btn { width:100%; padding:10px; border-radius:10px;
          border:1.5px solid #E2E8F0; background:#fff; cursor:pointer;
          font-size:14px; color:#64748B; }
        .iframe-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6);
          display:flex; align-items:center; justify-content:center; z-index:9999; }
        .iframe-container { background:#fff; border-radius:16px; overflow:hidden;
          width:min(600px,95vw); max-height:90vh; display:flex;
          flex-direction:column; position:relative; }
        .iframe-header { display:flex; align-items:center; justify-content:space-between;
          padding:14px 20px; border-bottom:1px solid #E2E8F0; background:#F8FAFC; }
        .iframe-header span { font-size:14px; font-weight:600; color:#374151; }
        .iframe-close { background:none; border:none; font-size:20px; cursor:pointer;
          color:#64748B; padding:4px; border-radius:6px; transition:background 0.2s; }
        .iframe-close:hover { background:#E2E8F0; }
        .iframe-body { flex:1; overflow:hidden; min-height:500px; }
        .iframe-body iframe { width:100%; height:100%; border:none; min-height:500px; }
      </style>

      <div class="container">
        ${this.error ? `<div class="error">⚠ ${this.error}</div>` : ""}
        ${!isReady ? `<div class="error">⚠ Configuration MiPS non configurée.</div>` : ""}
        <button id="mips-pay-btn" class="pay-btn" ${!isReady || this.loading ? "disabled" : ""}>
          ${this.loading ? "⏳ Traitement..." : `${this.buttonText} — ${displayAmount}`}
        </button>
        <div class="secure-badge">🔒 Paiement sécurisé via <strong>MiPS</strong></div>
      </div>

      ${
        this.showCustomerForm
          ? `
        <div class="overlay">
          <div class="modal">
            <button id="mips-cancel-form" class="modal-close">✕</button>
            <h2>${this.paymentTitle}</h2>
            <p class="subtitle">Vos informations pour finaliser le paiement</p>
            <div class="amount-badge">Montant : <strong>${displayAmount}</strong></div>
            ${
              this.customerFormErrors.length > 0
                ? `
              <div class="form-errors">
                ${this.customerFormErrors.map((e) => `<p>⚠ ${e}</p>`).join("")}
              </div>`
                : ""
            }
            <div class="form-row">
              <div class="form-group">
                <label>Prénom *</label>
                <input id="mips-firstname" type="text" placeholder="Jean" />
              </div>
              <div class="form-group">
                <label>Nom *</label>
                <input id="mips-lastname" type="text" placeholder="Dupont" />
              </div>
            </div>
            <div class="form-group">
              <label>Téléphone *</label>
              <input id="mips-phone" type="tel" placeholder="+230 5xxx xxxx" />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input id="mips-email" type="email" placeholder="jean@email.com" />
            </div>
            <button id="mips-confirm-pay" class="confirm-btn">
              Procéder au paiement — ${displayAmount}
            </button>
            <button id="mips-cancel-form-2" class="cancel-btn">Annuler</button>
          </div>
        </div>`
          : ""
      }

      ${
        this.showIframe
          ? `
        <div class="iframe-overlay">
          <div class="iframe-container">
            <div class="iframe-header">
              <span>🔒 Paiement sécurisé MiPS — ${displayAmount}</span>
              <button id="mips-iframe-close" class="iframe-close" title="Fermer">✕</button>
            </div>
            <div class="iframe-body">
              ${
                this.iframeHtml
                  ? this.iframeHtml
                  : `<div style="padding:40px;text-align:center;color:#64748B">Chargement...</div>`
              }
            </div>
          </div>
        </div>`
          : ""
      }
    `;

    // Bouton annuler secondaire dans le modal
    const cancelBtn2 = this.shadow.getElementById("mips-cancel-form-2");
    if (cancelBtn2)
      cancelBtn2.addEventListener("click", () => {
        this.showCustomerForm = false;
        this.customerFormErrors = [];
        this.render();
        this.attachEvents();
      });
  }
}

if (!customElements.get("mips-pay")) {
  customElements.define("mips-pay", MipsPay);
}

// Export pour usage Wix si nécessaire
// export { encryptCredentials, decryptCredentials };
