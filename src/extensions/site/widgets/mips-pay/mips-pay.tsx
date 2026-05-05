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
  private showModal = false;
  private paymentLink = "";
  private qrCode = "";
  private dynamicAmount = 0;
  private cartItems: any[] = [];
  private loadingCredentials = false;
  private credentialsLoaded = false;

  private readonly DEFAULT_FIXED_AMOUNT = 2000;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    console.log("[MiPS] connectedCallback - Démarrage");
    this.render();
    this.attachEvents();

    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("[MiPS] Clé publique après chargement:", this.publicKey);

    if (this.publicKey) {
      await this.loadMerchantCredentials(this.publicKey);
    } else {
      console.log("[MiPS] Pas de clé publique");
    }

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
    console.log(`[MiPS] attributeChanged: ${name} = ${newValue}`);

    if (name === "public-key" && newValue && newValue !== oldValue) {
      if (!this.credentialsLoaded) {
        this.loadMerchantCredentials(newValue);
      }
    }

    if (name === "amount" && newValue) {
      const parsed = parseFloat(newValue);
      if (!isNaN(parsed) && parsed > 0) {
        this.dynamicAmount = parsed;
        console.log(`[MiPS] dynamicAmount mis à jour: ${this.dynamicAmount}`);
      }
    }

    this.render();
    this.attachEvents();
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
      console.log("[MiPS] Réponse credentials:", data);

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
        console.log("[MiPS] credentials chargés avec succès");
        this.render();
        this.attachEvents();
      } else {
        console.log("[MiPS] Aucun credential trouvé");
        if (attempt < MAX_ATTEMPTS) {
          console.log(
            `[MiPS] Tentative ${attempt}/${MAX_ATTEMPTS} dans 2 secondes...`,
          );
          await new Promise((r) => setTimeout(r, 2000));
          return this.loadMerchantCredentials(publicKey, attempt + 1);
        } else {
          this.loadingCredentials = false;
          this.error =
            "Impossible de charger la configuration MiPS. Vérifiez votre clé publique.";
          this.render();
          this.attachEvents();
        }
      }
    } catch (err) {
      console.error("[MiPS] Erreur chargement credentials:", err);
      if (attempt < MAX_ATTEMPTS) {
        console.log(
          `[MiPS] Tentative ${attempt}/${MAX_ATTEMPTS} dans 2 secondes...`,
        );
        await new Promise((r) => setTimeout(r, 2000));
        return this.loadMerchantCredentials(publicKey, attempt + 1);
      } else {
        this.loadingCredentials = false;
        this.error = `Erreur réseau: impossible de joindre le serveur MiPS.`;
        this.render();
        this.attachEvents();
      }
    }
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
    const amount = parseFloat(this.getAttribute("amount") || "0");
    return amount > 0 ? amount : this.DEFAULT_FIXED_AMOUNT;
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

  private async getWixCartTotal(): Promise<{ amount: number; items: any[] }> {
    try {
      // Vérification sécurisée pour éviter les erreurs cross-origin
      if (this.isInCrossOriginFrame()) {
        console.log(
          "[MiPS] Exécution dans un frame cross-origin, accès DOM limité",
        );
        return await this.getCartTotalViaPostMessage();
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
        "[class*='total']",
      ];

      for (const selector of selectors) {
        // Accès sécurisé à window.parent.document uniquement si autorisé
        const el = this.getSafeElement(selector);
        if (el) {
          const text = el.textContent || "";
          const amount = parseFloat(text.replace(/[^0-9.]/g, ""));
          if (!isNaN(amount) && amount > 0) {
            console.log(
              "[MiPS] Montant trouvé via DOM:",
              amount,
              "selector:",
              selector,
            );
            return { amount, items: [] };
          }
        }
      }

      const cartAmount = await this.getAmountViaPostMessage();
      if (cartAmount > 0) return { amount: cartAmount, items: [] };

      console.log("[MiPS] Aucun montant trouvé, utilisation du montant fixe");
      return { amount: this.fixedAmount, items: [] };
    } catch (error) {
      console.error("Erreur panier Wix:", error);
      return { amount: this.fixedAmount, items: [] };
    }
  }

  private isInCrossOriginFrame(): boolean {
    try {
      // Tenter d'accéder à window.parent.document pour détecter l'erreur cross-origin
      return window.parent !== window && !window.parent.document;
    } catch (e) {
      // Une erreur se produit en cas de cross-origin
      return true;
    }
  }

  private getSafeElement(selector: string): Element | null {
    try {
      // Essayer d'abord le document local
      const localEl = document.querySelector(selector);
      if (localEl) return localEl;

      // Tentative sécurisée pour window.parent.document
      if (window.parent !== window) {
        try {
          // Vérifier si on peut accéder au parent document
          if (window.parent.document) {
            return window.parent.document.querySelector(selector);
          }
        } catch (e) {
          // Cross-origin - ignorer silencieusement
          console.debug("[MiPS] Accès parent document refusé:", e);
        }
      }

      return null;
    } catch (error) {
      console.debug("[MiPS] Erreur accès élément:", error);
      return null;
    }
  }

  private async getCartTotalViaPostMessage(): Promise<{
    amount: number;
    items: any[];
  }> {
    try {
      const amount = await this.getAmountViaPostMessage();
      if (amount > 0) return { amount, items: [] };
      return { amount: this.fixedAmount, items: [] };
    } catch (error) {
      console.error(
        "[MiPS] Erreur récupération panier via postMessage:",
        error,
      );
      return { amount: this.fixedAmount, items: [] };
    }
  }

  private _cartRequestPending = false;

  private getAmountViaPostMessage(): Promise<number> {
    if (this._cartRequestPending) {
      return Promise.resolve(0);
    }
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
            const amount = event.data.cartTotal || event.data.total || 0;
            resolve(parseFloat(String(amount)) || 0);
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
        console.log("[MiPS] Demande de montant panier envoyée");
      } catch (e) {
        this._cartRequestPending = false;
        clearTimeout(timeout);
        cleanup();
        resolve(0);
      }
    });
  }
  private getAmountFromSelector(): number {
    if (!this.amountSelector) return this.DEFAULT_FIXED_AMOUNT;
    try {
      const element = document.querySelector(this.amountSelector);
      if (element) {
        const text =
          element.textContent || element.getAttribute("data-amount") || "";
        const amount = parseFloat(text.replace(/[^0-9.-]/g, ""));
        return !isNaN(amount) && amount > 0
          ? amount
          : this.DEFAULT_FIXED_AMOUNT;
      }
    } catch (error) {
      console.error("Erreur sélecteur montant:", error);
    }
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
      case "fixed":
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
      if (event.data?.type === "wixCartUpdated") {
        await this.updateDynamicAmount();
      }
    });
    if (!this.isInCrossOriginFrame()) {
      if (this.amountSource === "cart" || this.amountSource === "selector") {
        const observer = new MutationObserver(async () => {
          await this.updateDynamicAmount();
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-total", "data-cart-total"],
        });
      }
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
    const closeBtns = this.shadow.querySelectorAll("#mips-modal-close");
    closeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.showModal = false;
        this.render();
        this.attachEvents();
      });
    });
  }

  private async handlePay() {
    if (!this.credentialsLoaded || !this.idMerchant) {
      this.error =
        "Configuration MiPS non chargée. Patientez ou rechargez la page.";
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

    this.loading = true;
    this.error = "";
    this.render();
    this.attachEvents();

    try {
      const payload = {
        amount: this.dynamicAmount,
        title: this.paymentTitle,
        currency: this.currency,
        sending_mode: this.sendingMode,
        request_mode: this.requestMode,
        public_key: this.publicKey,
        id_merchant: this.idMerchant,
        id_entity: this.idEntity,
        operator_id: this.operatorId,
        operator_password: this.operatorPassword,
        redirect_url: window.location.href,
      };

      console.log("[MiPS] Envoi de la requête de paiement");

      const res = await fetch(`${BACKEND}/api/create-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      console.log("[MiPS] Réponse backend:", data);

      if (data.payment_link) {
        this.paymentLink = data.payment_link;
        this.qrCode = data.qr_code || "";
        this.showModal = true;
        this.error = "";
      } else {
        this.error = data.error || "Erreur lors de la création du paiement.";
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur réseau";
      console.error("[MiPS] Erreur:", err);
      this.error = `Erreur: ${msg}`;
    }

    this.loading = false;
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

    this.shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: system-ui, -apple-system, Inter, sans-serif; }
        .container { max-width: 400px; width: 100%; }
        .error {
          color: #DC2626; font-size: 13px; margin-bottom: 8px;
          padding: 12px; background: #FEE2E2; border-radius: 6px;
          white-space: pre-line; text-align: center;
        }
        .warning {
          color: #D97706; font-size: 13px; margin-bottom: 8px;
          padding: 12px; background: #FEF3C7; border-radius: 6px; text-align: center;
        }
        .info {
          color: #3B82F6; font-size: 13px; margin-bottom: 8px;
          padding: 12px; background: #DBEAFE; border-radius: 6px; text-align: center;
        }
        .pay-btn {
          width: 100%; padding: 14px; border-radius: 10px; border: none;
          background: ${this.loading ? "#93C5FD" : isReady ? this.buttonColor : "#9CA3AF"};
          color: #fff; font-size: 16px; font-weight: 700;
          cursor: ${isReady && !this.loading ? "pointer" : "not-allowed"};
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all 0.2s; opacity: ${isReady ? 1 : 0.6};
        }
        .pay-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
        .pay-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .secure-badge {
          display: flex; align-items: center; justify-content: center;
          gap: 6px; margin-top: 8px; font-size: 11px; color: #94A3B8;
        }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center; z-index: 9999;
        }
        .modal {
          background: #fff; border-radius: 16px; padding: 32px;
          max-width: 440px; width: 90%; text-align: center; position: relative;
        }
        .modal-close {
          position: absolute; top: 12px; right: 16px;
          background: none; border: none; font-size: 20px; cursor: pointer; color: #64748B;
        }
        .modal h2 { margin: 12px 0 8px; font-size: 20px; }
        .modal p { color: #64748B; font-size: 14px; margin-bottom: 20px; }
        .modal img {
          width: 160px; height: 160px; border: 1px solid #E2E8F0;
          border-radius: 8px; margin: 0 auto 20px; display: block;
        }
        .pay-link-btn {
          display: block; padding: 14px; border-radius: 10px;
          background: ${this.buttonColor}; color: #fff;
          font-weight: 700; font-size: 15px; text-decoration: none; margin-bottom: 12px;
        }
        .close-btn {
          width: 100%; padding: 10px; border-radius: 10px;
          border: 1.5px solid #E2E8F0; background: #fff;
          cursor: pointer; font-size: 14px; color: #64748B;
        }
      </style>

      <div class="container">
        ${
          !hasPublicKey
            ? `
          <div class="error">
            ⚠️ Configuration manquante<br/><br/>
            Veuillez configurer votre clé publique MiPS dans les paramètres du widget.
          </div>
        `
            : !isReady && this.loadingCredentials
              ? `
          <div class="info">
            ⏳ Chargement de votre configuration MiPS...<br/>
            <small>Veuillez patienter quelques instants.</small>
          </div>
        `
              : !isReady && this.error
                ? `
          <div class="error">❌ ${this.error}</div>
        `
                : ""
        }

        <button
          id="mips-pay-btn"
          class="pay-btn"
          ${this.loading || !isReady ? "disabled" : ""}
        >
          ${this.loading ? "⏳ Traitement..." : `💳 ${this.buttonText} — ${displayAmount}`}
        </button>

        <div class="secure-badge">
          Paiement sécurisé via <strong>MiPS</strong>
        </div>
      </div>

      ${
        this.showModal
          ? `
        <div class="modal-overlay">
          <div class="modal">
            <button id="mips-modal-close" class="modal-close">✕</button>
            <div style="font-size:40px">✅</div>
            <h2>Demande de paiement créée !</h2>
            <p>Montant : ${displayAmount}</p>
            ${this.qrCode ? `<img src="${this.qrCode}" alt="QR Code MiPS" />` : ""}
            <a href="${this.paymentLink}" target="_blank" class="pay-link-btn">
              🔗 Accéder à la page de paiement MiPS
            </a>
            <button id="mips-modal-close" class="close-btn">Fermer</button>
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
