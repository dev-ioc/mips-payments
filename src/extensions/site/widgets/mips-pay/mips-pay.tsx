const BACKEND = "https://mips-wix-backend.onrender.com";

interface Window {
  wix: any;
  Wix: any;
  wixEmbedsAPI: any;
}

class MipsPay extends HTMLElement {
  static get observedAttributes() {
    return [
      "public-key",
      "button-text",
      "button-color",
      "amount",
      "currency",
      "payment-title",
      "sending-mode",
      "request-mode",
      "amount-source",
      "amount-selector",
      "id-merchant",
      "id-entity",
      "operator-id",
      "operator-password",
    ];
  }

  private shadow: ShadowRoot;
  private loading = false;
  private error = "";
  private dynamicAmount = 0;
  private cartItems: any[] = [];
  private loadingCredentials = false;
  private credentialsLoaded = false;

  private showCustomerForm = false;
  private customerFormErrors: string[] = [];
  private customerInfo = { firstName: "", lastName: "", phone: "", email: "" };

  private showIframe = false;
  private iframeHtml = "";
  private iframeUrl = "";
  private paymentId = "";

  private readonly DEFAULT_FIXED_AMOUNT = 0;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    this.render();
    this.attachEvents();
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (this.publicKey) await this.loadMerchantCredentials(this.publicKey);
    if (this.amountSource !== "cart" || !this.isInCrossOriginFrame()) {
      await this.updateDynamicAmount();
    } else {
      this.dynamicAmount = this.fixedAmount;
      this.render();
      this.attachEvents();
    }
    this.listenToCartChanges();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === "public-key" && newValue && newValue !== oldValue) {
      if (!this.credentialsLoaded) this.loadMerchantCredentials(newValue);
    }
    if (name === "amount" && newValue) {
      const parsed = parseFloat(newValue);
      if (!isNaN(parsed) && parsed > 0) this.dynamicAmount = parsed;
    }
    this.render();
    this.attachEvents();
  }

  private get publicKey() {
    return this.getAttribute("public-key") || "";
  }
  private get buttonText() {
    return this.getAttribute("button-text") || "Payer avec MiPS";
  }
  private get buttonColor() {
    return this.getAttribute("button-color") || "#2563EB";
  }
  private get fixedAmount() {
    const a = parseFloat(this.getAttribute("amount") || "0");
    return a > 0 ? a : this.DEFAULT_FIXED_AMOUNT;
  }
  private get currency() {
    return this.getAttribute("currency") || "MUR";
  }
  private get paymentTitle() {
    return this.getAttribute("payment-title") || "Paiement";
  }
  private get sendingMode() {
    return this.getAttribute("sending-mode") || "link";
  }
  private get requestMode() {
    return this.getAttribute("request-mode") || "simple";
  }
  private get amountSource() {
    return this.getAttribute("amount-source") || "cart";
  }
  private get amountSelector() {
    return this.getAttribute("amount-selector") || "";
  }
  private get idMerchant() {
    return this.getAttribute("id-merchant") || "";
  }
  private get idEntity() {
    return this.getAttribute("id-entity") || "";
  }
  private get operatorId() {
    return this.getAttribute("operator-id") || "";
  }
  private get operatorPassword() {
    return this.getAttribute("operator-password") || "";
  }

  private async loadMerchantCredentials(
    publicKey: string,
    attempt = 1,
  ): Promise<void> {
    const MAX_ATTEMPTS = 3;
    try {
      const res = await fetch(
        `${BACKEND}/api/merchant/get-credentials?public_key=${encodeURIComponent(publicKey)}`,
      );
      const data = await res.json();
      const m = data?.merchant;
      if (
        m?.id_merchant &&
        m?.id_entity &&
        m?.operator_id &&
        m?.operator_password
      ) {
        this.setAttribute("id-merchant", m.id_merchant);
        this.setAttribute("id-entity", m.id_entity);
        this.setAttribute("operator-id", m.operator_id);
        this.setAttribute("operator-password", m.operator_password);
        if (m.currency) this.setAttribute("currency", m.currency);
        if (m.sending_mode) this.setAttribute("sending-mode", m.sending_mode);
        if (m.request_mode) this.setAttribute("request-mode", m.request_mode);
        this.credentialsLoaded = true;
        this.loadingCredentials = false;
        this.render();
        this.attachEvents();
      } else {
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 2000));
          return this.loadMerchantCredentials(publicKey, attempt + 1);
        } else {
          this.loadingCredentials = false;
          this.error = "Impossible de charger la configuration MiPS.";
          this.render();
          this.attachEvents();
        }
      }
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 2000));
        return this.loadMerchantCredentials(publicKey, attempt + 1);
      } else {
        this.loadingCredentials = false;
        this.error =
          "Erreur r\u00e9seau: impossible de joindre le serveur MiPS.";
        this.render();
        this.attachEvents();
      }
    }
  }

  private isInCrossOriginFrame(): boolean {
    try {
      return window.parent !== window && !window.parent.document;
    } catch (e) {
      return true;
    }
  }

  private getSafeElement(selector: string): Element | null {
    try {
      const localEl = document.querySelector(selector);
      if (localEl) return localEl;
      if (window.parent !== window) {
        try {
          if (window.parent.document)
            return window.parent.document.querySelector(selector);
        } catch (e) {}
      }
      return null;
    } catch {
      return null;
    }
  }

  private _cartRequestPending = false;
  private getAmountViaPostMessage(): Promise<number> {
    if (this._cartRequestPending) return Promise.resolve(0);
    this._cartRequestPending = true;
    return new Promise((resolve) => {
      let isResolved = false;
      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this._cartRequestPending = false;
          cleanup();
          resolve(0);
        }
      }, 3000);
      const cleanup = () => {
        try {
          window.removeEventListener("message", handler);
        } catch (e) {}
      };
      const handler = (event: MessageEvent) => {
        if (event.data?.type === "wixCart" || event.data?.cartTotal) {
          if (!isResolved) {
            isResolved = true;
            this._cartRequestPending = false;
            clearTimeout(timeout);
            cleanup();
            resolve(
              parseFloat(
                String(event.data.cartTotal || event.data.total || 0),
              ) || 0,
            );
          }
        }
      };
      try {
        window.addEventListener("message", handler);
        window.parent.postMessage(
          {
            type: "getCartTotal",
            source: "mips-payment",
            timestamp: Date.now(),
          },
          "*",
        );
      } catch (e) {
        this._cartRequestPending = false;
        clearTimeout(timeout);
        cleanup();
        resolve(0);
      }
    });
  }

  private async getWixCartTotal(): Promise<{ amount: number; items: any[] }> {
    try {
      if (this.isInCrossOriginFrame()) {
        const amount = await this.getAmountViaPostMessage();
        return { amount: amount > 0 ? amount : this.fixedAmount, items: [] };
      }
      if (window.wixEmbedsAPI?.getCurrentCart) {
        const cart = await window.wixEmbedsAPI.getCurrentCart();
        const amount = cart?.totals?.total || cart?.totalPrice || 0;
        if (amount > 0) return { amount, items: cart.items || [] };
      }
      const selectors = [
        "[data-hook='cart-total']",
        "[data-hook='order-total']",
        ".cart-total",
        ".order-total",
      ];
      for (const selector of selectors) {
        const el = this.getSafeElement(selector);
        if (el) {
          const amount = parseFloat(
            (el.textContent || "").replace(/[^0-9.]/g, ""),
          );
          if (!isNaN(amount) && amount > 0) return { amount, items: [] };
        }
      }
      const cartAmount = await this.getAmountViaPostMessage();
      return {
        amount: cartAmount > 0 ? cartAmount : this.fixedAmount,
        items: [],
      };
    } catch {
      return { amount: this.fixedAmount, items: [] };
    }
  }

  private getAmountFromSelector(): number {
    if (!this.amountSelector) return this.DEFAULT_FIXED_AMOUNT;
    try {
      const element = document.querySelector(this.amountSelector);
      if (element) {
        const amount = parseFloat(
          (
            element.textContent ||
            element.getAttribute("data-amount") ||
            ""
          ).replace(/[^0-9.-]/g, ""),
        );
        return !isNaN(amount) && amount > 0
          ? amount
          : this.DEFAULT_FIXED_AMOUNT;
      }
    } catch {}
    return this.DEFAULT_FIXED_AMOUNT;
  }

  private async updateDynamicAmount(): Promise<void> {
    let amount = 0;
    let items: any[] = [];
    switch (this.amountSource) {
      case "cart":
        const cartData = await this.getWixCartTotal();
        amount = cartData.amount;
        items = cartData.items;
        break;
      case "selector":
        amount = this.getAmountFromSelector();
        break;
      default:
        amount = this.fixedAmount;
        break;
    }
    this.dynamicAmount = amount > 0 ? amount : this.DEFAULT_FIXED_AMOUNT;
    this.cartItems = items;
    this.render();
    this.attachEvents();
  }

  private listenToCartChanges(): void {
    window.addEventListener("message", async (event) => {
      if (event.data?.type === "wixCartUpdated")
        await this.updateDynamicAmount();
    });
    if (
      !this.isInCrossOriginFrame() &&
      (this.amountSource === "cart" || this.amountSource === "selector")
    ) {
      const observer = new MutationObserver(
        async () => await this.updateDynamicAmount(),
      );
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-total", "data-cart-total"],
      });
    }
  }

  private attachEvents() {
    const btn = this.shadow.getElementById("mips-pay-btn");
    if (btn) {
      const newBtn = btn.cloneNode(true);
      btn.parentNode?.replaceChild(newBtn, btn);
      newBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handlePay();
      });
    }

    const firstNameInput = this.shadow.getElementById(
      "mips-firstname",
    ) as HTMLInputElement;
    const lastNameInput = this.shadow.getElementById(
      "mips-lastname",
    ) as HTMLInputElement;
    const phoneInput = this.shadow.getElementById(
      "mips-phone",
    ) as HTMLInputElement;
    const emailInput = this.shadow.getElementById(
      "mips-email",
    ) as HTMLInputElement;

    if (firstNameInput) {
      firstNameInput.value = this.customerInfo.firstName;
      firstNameInput.addEventListener("input", (e) => {
        this.customerInfo.firstName = (e.target as HTMLInputElement).value;
      });
    }
    if (lastNameInput) {
      lastNameInput.value = this.customerInfo.lastName;
      lastNameInput.addEventListener("input", (e) => {
        this.customerInfo.lastName = (e.target as HTMLInputElement).value;
      });
    }
    if (phoneInput) {
      phoneInput.value = this.customerInfo.phone;
      phoneInput.addEventListener("input", (e) => {
        this.customerInfo.phone = (e.target as HTMLInputElement).value;
      });
    }
    if (emailInput) {
      emailInput.value = this.customerInfo.email;
      emailInput.addEventListener("input", (e) => {
        this.customerInfo.email = (e.target as HTMLInputElement).value;
      });
    }

    const confirmBtn = this.shadow.getElementById("mips-confirm-pay");
    if (confirmBtn)
      confirmBtn.addEventListener("click", () => this.processPayment());

    const cancelFormBtn = this.shadow.getElementById("mips-cancel-form");
    if (cancelFormBtn)
      cancelFormBtn.addEventListener("click", () => {
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
        this.iframeUrl = "";
        this.render();
        this.attachEvents();
      });

    window.addEventListener("message", (event) => {
      if (
        event.data?.type === "mips_payment_success" ||
        event.data?.payment_status === "success"
      ) {
        this.handlePaymentSuccess();
      }
      if (
        event.data?.type === "mips_payment_failed" ||
        event.data?.payment_status === "failed"
      ) {
        this.handlePaymentFailed();
      }
    });
  }

  private handlePay() {
    if (!this.credentialsLoaded || !this.idMerchant) {
      this.error =
        "Configuration MiPS non charg\u00e9e. Patientez ou rechargez la page.";
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
    this.showCustomerForm = true;
    this.customerFormErrors = [];
    this.render();
    this.attachEvents();
  }

  private async processPayment() {
    const errors: string[] = [];
    if (!this.customerInfo.firstName.trim())
      errors.push("Le pr\u00e9nom est requis");
    if (!this.customerInfo.lastName.trim()) errors.push("Le nom est requis");
    if (!this.customerInfo.phone.trim())
      errors.push("Le t\u00e9l\u00e9phone est requis"); // ✅ Bug corrigé
    else if (!/^[0-9\s\+\-]{7,15}$/.test(this.customerInfo.phone.trim()))
      errors.push("Num\u00e9ro de t\u00e9l\u00e9phone invalide");

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
      const payload = {
        public_key: this.publicKey,
        amount: this.dynamicAmount,
        title: this.paymentTitle,
        currency: this.currency,
        request_mode: this.requestMode,
        redirect_url: `${window.location.origin}/thank-you-page`,
        callback_url: `${BACKEND}/api/payment-callback`,
        customer: {
          first_name: this.customerInfo.firstName.trim(),
          last_name: this.customerInfo.lastName.trim(),
          phone_number: this.customerInfo.phone.trim(),
          client_email: this.customerInfo.email.trim(),
        },
      };

      const res = await fetch(`${BACKEND}/api/load-payment-zone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.iframe_html || data.iframe_url) {
        this.iframeHtml = data.iframe_html || "";
        this.iframeUrl = data.iframe_url || "";
        this.paymentId = data.payment_id || "";
        this.showIframe = true;
        this.error = "";
      } else if (data.payment_link) {
        this.paymentId = data.payment_id || "";
        window.open(data.payment_link, "_blank");
        this.error = "";
      } else {
        this.error =
          data.error || "Erreur lors de la cr\u00e9ation du paiement.";
      }
    } catch (err: unknown) {
      this.error = `Erreur: ${err instanceof Error ? err.message : "Erreur r\u00e9seau"}`;
    }

    this.loading = false;
    this.render();
    this.attachEvents();
  }

  private handlePaymentSuccess() {
    this.showIframe = false;
    this.iframeHtml = "";
    this.error = "";
    this.shadow.innerHTML += `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;
        align-items:center;justify-content:center;z-index:9999;">
        <div style="background:#fff;border-radius:16px;padding:32px;text-align:center;max-width:380px;width:90%;">
          <div style="font-size:48px;margin-bottom:8px">&#10003;</div>
          <h2 style="margin:12px 0 8px">Paiement r\u00e9ussi !</h2>
          <p style="color:#64748B">Votre paiement de ${this.getDisplayAmount()} a \u00e9t\u00e9 trait\u00e9 avec succ\u00e8s.</p>
          <p style="font-size:12px;color:#94A3B8">R\u00e9f\u00e9rence : ${this.paymentId}</p>
        </div>
      </div>
    `;
  }

  private handlePaymentFailed() {
    this.showIframe = false;
    this.error = "Le paiement a \u00e9chou\u00e9. Veuillez r\u00e9essayer.";
    this.render();
    this.attachEvents();
  }

  private getDisplayAmount(): string {
    const amount =
      this.dynamicAmount > 0 ? this.dynamicAmount : this.DEFAULT_FIXED_AMOUNT;
    return `${amount.toFixed(2)} ${this.currency}`;
  }

  render() {
    const displayAmount = this.getDisplayAmount();
    const hasPublicKey = !!this.publicKey;
    const isReady = this.credentialsLoaded && hasPublicKey;
    const color = this.buttonColor;

    this.shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
        .container { max-width: 400px; width: 100%; }
        .error { color:#DC2626; font-size:13px; margin-bottom:8px; padding:12px; background:#FEE2E2; border-radius:6px; text-align:center; }
        .info  { color:#3B82F6; font-size:13px; margin-bottom:8px; padding:12px; background:#DBEAFE; border-radius:6px; text-align:center; }
        .pay-btn {
          width:100%; padding:14px; border-radius:10px; border:none;
          background:${this.loading ? "#93C5FD" : isReady ? color : "#9CA3AF"};
          color:#fff; font-size:16px; font-weight:700;
          cursor:${isReady && !this.loading ? "pointer" : "not-allowed"};
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition:all 0.2s; opacity:${isReady ? 1 : 0.6};
        }
        .pay-btn:hover:not(:disabled) { opacity:0.92; transform:translateY(-1px); }
        .secure-badge { display:flex; align-items:center; justify-content:center; gap:6px; margin-top:8px; font-size:11px; color:#94A3B8; }
        .overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.5);
          display:flex; align-items:center; justify-content:center; z-index:9999;
        }
        .modal {
          background:#fff; border-radius:16px; padding:28px;
          max-width:420px; width:90%; position:relative;
        }
        .modal-close {
          position:absolute; top:12px; right:16px;
          background:none; border:none; font-size:20px; cursor:pointer; color:#64748B;
        }
        .modal h2 { margin:0 0 4px; font-size:18px; text-align:center; }
        .modal .subtitle { color:#64748B; font-size:13px; text-align:center; margin-bottom:16px; }
        .amount-badge {
          background:#F1F5F9; border-radius:8px; padding:10px;
          text-align:center; margin-bottom:16px; font-size:14px;
        }
        .amount-badge strong { color:${color}; font-size:18px; }
        .form-row { display:flex; gap:12px; }
        .form-group { margin-bottom:14px; flex:1; }
        .form-group label { display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:5px; }
        .form-group input {
          width:100%; padding:10px 12px; border:1.5px solid #E2E8F0;
          border-radius:8px; font-size:14px; outline:none; transition:border 0.2s;
        }
        .form-group input:focus { border-color:${color}; }
        .form-errors { background:#FEE2E2; border-radius:8px; padding:10px 14px; margin-bottom:14px; }
        .form-errors p { color:#DC2626; font-size:12px; margin:2px 0; }
        .confirm-btn {
          width:100%; padding:13px; border-radius:10px; border:none;
          background:${color}; color:#fff; font-size:15px; font-weight:700;
          cursor:pointer; margin-bottom:8px; transition:opacity 0.2s;
        }
        .confirm-btn:hover { opacity:0.9; }
        .cancel-btn {
          width:100%; padding:10px; border-radius:10px;
          border:1.5px solid #E2E8F0; background:#fff;
          cursor:pointer; font-size:14px; color:#64748B;
        }
        .iframe-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.6);
          display:flex; align-items:center; justify-content:center; z-index:9999;
        }
        .iframe-container {
          background:#fff; border-radius:16px; overflow:hidden;
          width:min(600px, 95vw); max-height:90vh;
          display:flex; flex-direction:column; position:relative;
        }
        .iframe-header {
          display:flex; align-items:center; justify-content:space-between;
          padding:14px 20px; border-bottom:1px solid #E2E8F0; background:#F8FAFC;
        }
        .iframe-header span { font-size:14px; font-weight:600; color:#374151; }
        .iframe-close {
          background:none; border:none; font-size:20px; cursor:pointer; color:#64748B;
          padding:4px; border-radius:6px; transition:background 0.2s;
        }
        .iframe-close:hover { background:#E2E8F0; }
        .iframe-body { flex:1; overflow:hidden; min-height:500px; }
        .iframe-body iframe { width:100%; height:100%; border:none; min-height:500px; }
      </style>

      <div class="container">
        ${!hasPublicKey ? `<div class="error">[!] Cl\u00e9 publique MiPS manquante.</div>` : ""}
        ${!isReady && this.loadingCredentials ? `<div class="info">Chargement configuration MiPS...</div>` : ""}
        ${this.error ? `<div class="error">[X] ${this.error}</div>` : ""}

        <button id="mips-pay-btn" class="pay-btn" ${this.loading || !isReady ? "disabled" : ""}>
          ${this.loading ? "Traitement..." : `${this.buttonText} \u2014 ${displayAmount}`}
        </button>
        <div class="secure-badge">Paiement s\u00e9curis\u00e9 via <strong>MiPS</strong></div>
      </div>

      ${
        this.showCustomerForm
          ? `
        <div class="overlay">
          <div class="modal">
            <button id="mips-cancel-form" class="modal-close">X</button>
            <h2>Vos informations</h2>
            <p class="subtitle">Requis pour finaliser votre paiement</p>

            <div class="amount-badge">
              Montant : <strong>${displayAmount}</strong>
            </div>

            ${
              this.customerFormErrors.length > 0
                ? `
              <div class="form-errors">
                ${this.customerFormErrors.map((e) => `<p>[!] ${e}</p>`).join("")}
              </div>
            `
                : ""
            }

            <div class="form-row">
              <div class="form-group">
                <label>Pr\u00e9nom *</label>
                <input id="mips-firstname" type="text" placeholder="Jean" />
              </div>
              <div class="form-group">
                <label>Nom *</label>
                <input id="mips-lastname" type="text" placeholder="Dupont" />
              </div>
            </div>
            <div class="form-group">
              <label>T\u00e9l\u00e9phone *</label>
              <input id="mips-phone" type="tel" placeholder="+230 5xxx xxxx" />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input id="mips-email" type="email" placeholder="jean@email.com" />
            </div>

            <button id="mips-confirm-pay" class="confirm-btn">
              Proc\u00e9der au paiement \u2014 ${displayAmount}
            </button>
          </div>
        </div>
      `
          : ""
      }

      ${
        this.showIframe
          ? `
        <div class="iframe-overlay">
          <div class="iframe-container">
            <div class="iframe-header">
              <span>Paiement s\u00e9curis\u00e9 MiPS \u2014 ${displayAmount}</span>
              <button id="mips-iframe-close" class="iframe-close" title="Fermer">X</button>
            </div>
            <div class="iframe-body">
              ${
                this.iframeHtml
                  ? this.iframeHtml
                  : this.iframeUrl
                    ? `<iframe src="${this.iframeUrl}" allow="payment" sandbox="allow-scripts allow-forms allow-same-origin allow-top-navigation"></iframe>`
                    : `<div style="padding:40px;text-align:center;color:#64748B">Chargement...</div>`
              }
            </div>
          </div>
        </div>
      `
          : ""
      }
    `;
  }
}

if (!customElements.get("mips-pay")) {
  customElements.define("mips-pay", MipsPay);
}
