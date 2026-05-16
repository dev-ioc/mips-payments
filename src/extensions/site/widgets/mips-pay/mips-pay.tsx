// src/extensions/site/widgets/mips-pay/mips-pay.tsx
// ─── Clé de dérivation partagée avec panel.tsx ───────────────────────────────
const DERIVE_PASSPHRASE = "mips-wix-secure-2025";

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

function generateOrderId(): string {
  const ts = Date.now().toString().slice(-10);
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `WIX${ts}${rand}`;
}

// ─── Web Component ────────────────────────────────────────────────────────────
class MipsPay extends HTMLElement {
  static get observedAttributes() {
    return [
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

  private showCustomerForm = false;
  private customerFormErrors: string[] = [];
  private customerInfo = {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  };

  private showIframe = false;
  private iframeUrl = "";
  private paymentId = "";

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.dynamicAmount = this.fixedAmount;
    this.render();
    this.attachDOMEvents();

    if (!this.isEditorContext()) {
      this.updateDynamicAmount().then(() => {
        this.render();
        this.attachDOMEvents();
        this.listenToCartChanges();
      });
    }
  }

  attributeChangedCallback(name: string, _old: string, newVal: string) {
    if (name === "amount" && newVal) {
      const p = parseFloat(newVal);
      if (!isNaN(p) && p > 0 && this.dynamicAmount === 0) {
        this.dynamicAmount = p;
      }
    }
    if (this.isConnected) {
      this.render();
      this.attachDOMEvents();
    }
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
  private get hasCredentials() {
    return !!this.encryptedCredentials;
  }

  // ─── Détection contexte éditeur Wix ─────────────────────────────────────────
  private isEditorContext(): boolean {
    try {
      const w = window as any;
      if (w.__WIX_EDITOR__ || w.wixEditor) return true;
      const host = window.location.hostname;
      if (
        host.includes("editor.wix.com") ||
        host.includes("wix-dev-center-test") ||
        host.includes("editorx.com")
      )
        return true;
      return false;
    } catch {
      return false;
    }
  }

  // ── Déchiffrement credentials ────────────────────────────────────────────────
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
  // Améliorer la méthode updateDynamicAmount
  private async updateDynamicAmount(): Promise<void> {
    if (this.amountSource === "fixed" || !this.amountSource) {
      this.dynamicAmount = this.fixedAmount;
      return;
    }
    if (this.amountSource === "selector") {
      this.dynamicAmount = this.getAmountFromSelector() || this.fixedAmount;
      return;
    }
    if (this.amountSource === "cart") {
      const { amount } = await this.getWixCartTotal();
      const newAmount = amount > 0 ? amount : this.fixedAmount;

      if (this.dynamicAmount !== newAmount) {
        console.log(
          "[MiPS] Montant mis à jour:",
          newAmount,
          "ancien:",
          this.dynamicAmount,
        );
        this.dynamicAmount = newAmount;
      }
    }
  }

  // Améliorer la méthode handlePay pour plus de logs
  private handlePay() {
    console.log("[MiPS] handlePay appelé");
    console.log("[MiPS] isEditorContext:", this.isEditorContext());
    console.log("[MiPS] hasCredentials:", this.hasCredentials);
    console.log("[MiPS] dynamicAmount:", this.dynamicAmount);

    if (this.isEditorContext()) {
      console.log("[MiPS] Mode éditeur - pas d'action");
      return;
    }

    if (!this.hasCredentials) {
      this.error =
        "Configuration MiPS non configurée. Contactez l'administrateur du site.";
      console.error("[MiPS]", this.error);
      this.render();
      this.attachDOMEvents();
      return;
    }

    if (!this.dynamicAmount || this.dynamicAmount <= 0) {
      this.error = "Montant invalide ou panier vide.";
      console.error("[MiPS]", this.error);
      this.render();
      this.attachDOMEvents();
      return;
    }

    console.log("[MiPS] Affichage du formulaire client");
    this.error = "";
    this.showCustomerForm = true;
    this.customerFormErrors = [];
    this.render();
    this.attachDOMEvents();
  }

  // Ajouter une méthode pour forcer la mise à jour depuis le Velo
  public updateAmount(amount: number) {
    console.log("[MiPS] updateAmount appelé depuis Velo:", amount);
    if (amount > 0) {
      this.dynamicAmount = amount;
      this.render();
      this.attachDOMEvents();
    }
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
      const cartAmount = await this.getAmountViaPostMessage();
      return { amount: cartAmount > 0 ? cartAmount : this.fixedAmount };
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
      if (ev.data?.type === "wixCartUpdated") {
        await this.updateDynamicAmount();
        this.render();
        this.attachDOMEvents();
      }
    });
  }
  // Méthode utilitaire pour échapper le HTML
  private escapeHtml(str: string): string {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Extraire l'URL de l'iframe depuis le HTML retourné par MiPS
  private extractIframeUrl(html: string): string | null {
    // Chercher une balise iframe avec src
    const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/i;
    const match = html.match(iframeRegex);
    if (match && match[1]) {
      return match[1];
    }

    // Chercher un formulaire avec action
    const formRegex = /<form[^>]+action=["']([^"']+)["']/i;
    const formMatch = html.match(formRegex);
    if (formMatch && formMatch[1]) {
      return formMatch[1];
    }

    return null;
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
      this.attachDOMEvents();
      return;
    }

    this.showCustomerForm = false;
    this.loading = true;
    this.error = "";
    this.render();
    this.attachDOMEvents();

    try {
      const creds = await this.getCredentials();
      if (!creds) {
        this.error = "Impossible de charger les credentials MiPS.";
        this.loading = false;
        this.render();
        this.attachDOMEvents();
        return;
      }

      const id_order = generateOrderId();
      this.paymentId = id_order;

      const basicAuth = btoa(
        `${creds.auth_basic_username}:${creds.auth_basic_password}`,
      );

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

      console.log("MiPS Payload:", mipsPayload);

      const res = await fetch("https://api.mips.mu/api/load_payment_zone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify(mipsPayload),
      });

      const raw = await res.text();
      console.log("MiPS Response:", raw);

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
        // Extraire l'URL de l'iframe depuis le HTML retourné
        const iframeUrl = this.extractIframeUrl(paymentZoneData);

        if (iframeUrl) {
          this.iframeUrl = iframeUrl;
          this.showIframe = true;
          this.error = "";
        } else {
          // Si pas d'URL trouvée, créer un blob avec le HTML
          const blob = new Blob([paymentZoneData], { type: "text/html" });
          this.iframeUrl = URL.createObjectURL(blob);
          this.showIframe = true;
          this.error = "";
        }
      } else {
        throw new Error("Aucune zone de paiement retournée par MiPS");
      }
    } catch (err: any) {
      console.error("MiPS Error:", err);
      this.error = err.message || "Erreur réseau";
    }

    this.loading = false;
    this.render();
    this.attachDOMEvents();
  }

  private getDisplayAmount(): string {
    const amt = this.dynamicAmount > 0 ? this.dynamicAmount : this.fixedAmount;
    return amt > 0 ? `${amt.toFixed(2)} ${this.currency}` : this.currency;
  }

  // ── Events ───────────────────────────────────────────────────────────────────
  private attachDOMEvents() {
    const btn = this.shadow.getElementById("mips-pay-btn");
    if (btn) {
      const newBtn = btn.cloneNode(true);
      btn.parentNode?.replaceChild(newBtn, btn);
      newBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.handlePay();
      });
    }

    const fields: Array<[string, keyof typeof this.customerInfo]> = [
      ["mips-firstname", "firstName"],
      ["mips-lastname", "lastName"],
      ["mips-phone", "phone"],
      ["mips-email", "email"],
    ];
    for (const [id, key] of fields) {
      const el = this.shadow.getElementById(id) as HTMLInputElement | null;
      if (el) {
        el.value = this.customerInfo[key];
        el.addEventListener("input", (e) => {
          this.customerInfo[key] = (e.target as HTMLInputElement).value;
        });
      }
    }

    const confirmBtn = this.shadow.getElementById("mips-confirm-pay");
    if (confirmBtn) {
      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode?.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.addEventListener("click", () => this.processPayment());
    }

    ["mips-cancel-form", "mips-cancel-form-2"].forEach((id) => {
      const el = this.shadow.getElementById(id);
      if (el) {
        const newEl = el.cloneNode(true);
        el.parentNode?.replaceChild(newEl, el);
        newEl.addEventListener("click", () => {
          this.showCustomerForm = false;
          this.customerFormErrors = [];
          this.render();
          this.attachDOMEvents();
        });
      }
    });

    const closeBtn = this.shadow.getElementById("mips-iframe-close");
    if (closeBtn) {
      const newCloseBtn = closeBtn.cloneNode(true);
      closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);
      newCloseBtn.addEventListener("click", () => {
        this.showIframe = false;
        this.iframeUrl = "";
        this.render();
        this.attachDOMEvents();
      });
    }

    // Écouter les messages de l'iframe MiPS
    window.addEventListener("message", (ev) => {
      // Vérifier l'origine pour la sécurité
      const allowedOrigins = [
        "https://api.mips.mu",
        "https://mips.mu",
        "https://mips-payments.pages.dev",
      ];
      if (
        ev.origin &&
        allowedOrigins.some((o) => ev.origin.includes(o) || ev.origin === o)
      ) {
        if (
          ev.data?.status === "completed" ||
          ev.data?.payment_status === "success"
        ) {
          this.handlePaymentSuccess();
        } else if (
          ev.data?.status === "failed" ||
          ev.data?.payment_status === "failed"
        ) {
          this.handlePaymentFailed();
        }
      }

      // Types existants
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
    this.iframeUrl = "";
    this.error = "";

    // Nettoyer les blobs URL si nécessaire
    if (this.iframeUrl && this.iframeUrl.startsWith("blob:")) {
      URL.revokeObjectURL(this.iframeUrl);
    }

    const successDiv = document.createElement("div");
    successDiv.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999999;";
    successDiv.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:32px;text-align:center;max-width:380px;width:90%;font-family:system-ui;">
        <div style="font-size:48px;color:#16a34a;">✓</div>
        <h2 style="margin:12px 0 8px;color:#1E293B">Paiement réussi !</h2>
        <p style="color:#64748B">Votre paiement de ${this.getDisplayAmount()} a été traité avec succès.</p>
        <p style="font-size:12px;color:#94A3B8;margin-top:6px">Référence : ${this.paymentId}</p>
        <button onclick="this.closest('[style*=fixed]').remove()"
          style="margin-top:20px;padding:10px 24px;background:#2563EB;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:system-ui;font-size:14px;">
          Fermer
        </button>
      </div>`;
    document.body.appendChild(successDiv);

    this.render();
    this.attachDOMEvents();
  }

  private handlePaymentFailed() {
    this.showIframe = false;
    if (this.iframeUrl && this.iframeUrl.startsWith("blob:")) {
      URL.revokeObjectURL(this.iframeUrl);
    }
    this.iframeUrl = "";
    this.error = "Le paiement a échoué. Veuillez réessayer.";
    this.render();
    this.attachDOMEvents();
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────
  render() {
    const displayAmount = this.getDisplayAmount();
    const color = this.buttonColor;
    const isEditor = this.isEditorContext();
    const isReady = this.hasCredentials;

    const btnLabel = this.loading
      ? "⏳ Traitement en cours..."
      : `${this.buttonText}${this.fixedAmount > 0 || this.dynamicAmount > 0 ? ` — ${displayAmount}` : ""}`;

    this.shadow.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :host {
          display: block;
          width: 100%;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .wrapper { width: 100%; }

        .msg-error {
          color: #DC2626; font-size: 13px; margin-bottom: 10px;
          padding: 10px 14px; background: #FEF2F2;
          border: 1px solid #FECACA; border-radius: 8px;
          text-align: center; line-height: 1.5;
        }
        .msg-warn {
          color: #92400E; font-size: 12px; margin-bottom: 10px;
          padding: 8px 12px; background: #FFFBEB;
          border: 1px dashed #F59E0B; border-radius: 8px;
          text-align: center;
        }

        .pay-btn {
          width: 100%;
          padding: 14px 20px;
          border-radius: 10px;
          border: none;
          background: ${this.loading ? "#93C5FD" : color};
          color: #ffffff;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: ${this.loading ? "wait" : "pointer"};
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity 0.2s, transform 0.15s;
          min-height: 50px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          line-height: 1.2;
        }
        .pay-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .pay-btn:active:not(:disabled) { transform: translateY(0); }

        .secure-badge {
          display: flex; align-items: center; justify-content: center;
          gap: 5px; margin-top: 8px; font-size: 11px; color: #94A3B8;
        }
        .secure-badge strong { color: #64748B; }

        /* Overlay */
        .overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.55);
          display: flex; align-items: center; justify-content: center;
          z-index: 999999; padding: 16px;
        }
        .modal {
          background: #fff; border-radius: 20px;
          padding: 28px 24px 24px; width: 100%; max-width: 420px;
          position: relative;
          box-shadow: 0 20px 60px rgba(0,0,0,0.25);
          animation: slideUp 0.25s ease;
        }
        @keyframes slideUp {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .modal-close {
          position: absolute; top: 14px; right: 16px;
          background: #F1F5F9; border: none;
          width: 30px; height: 30px; border-radius: 50%;
          font-size: 14px; cursor: pointer; color: #64748B;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.2s;
        }
        .modal-close:hover { background: #E2E8F0; }
        .modal-title { font-size: 17px; font-weight: 700; color: #1E293B; text-align: center; margin-bottom: 4px; }
        .modal-subtitle { font-size: 13px; color: #94A3B8; text-align: center; margin-bottom: 16px; }
        .amount-badge {
          background: #F8FAFC; border: 1px solid #E2E8F0;
          border-radius: 10px; padding: 10px 14px;
          text-align: center; margin-bottom: 18px; font-size: 13px; color: #64748B;
        }
        .amount-badge span { font-size: 22px; font-weight: 800; color: ${color}; display: block; margin-top: 3px; }

        .form-errors {
          background: #FEF2F2; border: 1px solid #FECACA;
          border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;
        }
        .form-errors p { color: #DC2626; font-size: 12px; margin: 2px 0; }

        .form-row { display: flex; gap: 10px; }
        .form-group { margin-bottom: 12px; flex: 1; }
        .form-group label {
          display: block; font-size: 11px; font-weight: 700;
          color: #475569; margin-bottom: 5px;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .form-group input {
          width: 100%; padding: 10px 12px;
          border: 1.5px solid #E2E8F0; border-radius: 8px;
          font-size: 14px; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          color: #1E293B; background: #fff; font-family: inherit;
        }
        .form-group input:focus { border-color: ${color}; box-shadow: 0 0 0 3px ${color}22; }
        .form-group input::placeholder { color: #CBD5E1; }

        .confirm-btn {
          width: 100%; padding: 13px; border-radius: 10px; border: none;
          background: ${color}; color: #fff; font-size: 15px;
          font-weight: 700; cursor: pointer; margin-bottom: 8px;
          transition: opacity 0.2s; font-family: inherit;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .confirm-btn:hover { opacity: 0.9; }
        .cancel-btn {
          width: 100%; padding: 10px; border-radius: 10px;
          border: 1.5px solid #E2E8F0; background: #fff;
          cursor: pointer; font-size: 14px; color: #64748B;
          transition: background 0.2s; font-family: inherit;
        }
        .cancel-btn:hover { background: #F8FAFC; }

        /* Iframe */
        .iframe-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.65);
          display: flex; align-items: center; justify-content: center;
          z-index: 999999; padding: 12px;
        }
        .iframe-container {
          background: #fff; border-radius: 16px; overflow: hidden;
          width: min(600px, 100%); max-height: 92vh;
          display: flex; flex-direction: column;
          box-shadow: 0 24px 80px rgba(0,0,0,0.35);
        }
        .iframe-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px; border-bottom: 1px solid #E2E8F0;
          background: #F8FAFC; flex-shrink: 0;
        }
        .iframe-header-title { font-size: 14px; font-weight: 600; color: #374151; }
        .iframe-close {
          background: #E2E8F0; border: none; width: 28px; height: 28px;
          border-radius: 50%; font-size: 13px; cursor: pointer; color: #64748B;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.2s;
        }
        .iframe-close:hover { background: #CBD5E1; }
        .iframe-body { flex: 1; overflow: auto; min-height: 500px; background: #fff; }
        .iframe-body iframe { 
          width: 100%; 
          height: 500px; 
          border: none; 
          display: block;
          background: #fff;
        }
      </style>

      <div class="wrapper">
        ${!isReady && !isEditor ? `<div class="msg-warn">⚙ Configuration MiPS requise</div>` : ""}
        ${this.error ? `<div class="msg-error">⚠ ${this.error}</div>` : ""}

        <button id="mips-pay-btn" class="pay-btn" ${this.loading ? "disabled" : ""}>
          ${btnLabel}
        </button>

        <div class="secure-badge">🔒 Paiement sécurisé via <strong>MiPS</strong></div>
      </div>

      ${
        this.showCustomerForm
          ? `
        <div class="overlay">
          <div class="modal">
            <button id="mips-cancel-form" class="modal-close" title="Fermer">✕</button>
            <div class="modal-title">${this.paymentTitle}</div>
            <div class="modal-subtitle">Vos informations de contact</div>
            <div class="amount-badge">
              Montant à payer
              <span>${displayAmount}</span>
            </div>
            ${
              this.customerFormErrors.length > 0
                ? `
              <div class="form-errors">
                ${this.customerFormErrors.map((e) => `<p>• ${e}</p>`).join("")}
              </div>`
                : ""
            }
            <div class="form-row">
              <div class="form-group">
                <label>Prénom *</label>
                <input id="mips-firstname" type="text" placeholder="Jean" autocomplete="given-name" />
              </div>
              <div class="form-group">
                <label>Nom *</label>
                <input id="mips-lastname" type="text" placeholder="Dupont" autocomplete="family-name" />
              </div>
            </div>
            <div class="form-group">
              <label>Téléphone *</label>
              <input id="mips-phone" type="tel" placeholder="+230 5xxx xxxx" autocomplete="tel" />
            </div>
            <div class="form-group">
              <label>Email <span style="color:#94A3B8;font-weight:400;text-transform:none">(optionnel)</span></label>
              <input id="mips-email" type="email" placeholder="jean@email.com" autocomplete="email" />
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
        this.showIframe && this.iframeUrl
          ? `
        <div class="iframe-overlay">
          <div class="iframe-container">
            <div class="iframe-header">
              <div class="iframe-header-title">🔒 Paiement sécurisé — ${displayAmount}</div>
              <button id="mips-iframe-close" class="iframe-close" title="Fermer">✕</button>
            </div>
            <div class="iframe-body">
              <iframe src="${this.iframeUrl}" 
                      title="Formulaire de paiement sécurisé MiPS"
                      allow="payment *"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-top-navigation">
              </iframe>
            </div>
          </div>
        </div>`
          : ""
      }
    `;
  }
}

if (!customElements.get("mips-pay")) {
  customElements.define("mips-pay", MipsPay);
}
