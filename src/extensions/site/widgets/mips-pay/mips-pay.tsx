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
      "id-operator",
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
  private credentialsLoaded = false;
  private loadingCredentials = false;

  private readonly DEFAULT_FIXED_AMOUNT = 2000;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    console.log("[MiPS] connectedCallback - Démarrage");
    this.render();
    this.attachEvents();

    // Attendre que Wix injecte les attributs via widget.setProp
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("[MiPS] Clé publique après chargement:", this.publicKey);

    // Charger les credentials depuis le backend
    await this.loadMerchantCredentials();

    await this.updateDynamicAmount();
    this.listenToCartChanges();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    console.log(`[MiPS] attributeChanged: ${name} = ${newValue}`);

    if (name === "public-key" && newValue && newValue !== oldValue) {
      console.log(
        "[MiPS] Clé publique reçue ✅",
        newValue.substring(0, 20) + "...",
      );
      // Recharger les credentials si la clé publique change
      this.loadMerchantCredentials();
    }

    this.render();
    this.attachEvents();
  }

  // NOUVELLE MÉTHODE: Charge les credentials depuis le backend
  private async loadMerchantCredentials(): Promise<boolean> {
    const publicKey = this.publicKey;

    console.log(
      "[MiPS] loadMerchantCredentials - Clé publique:",
      publicKey ? publicKey.substring(0, 20) + "..." : "AUCUNE",
    );

    if (!publicKey) {
      console.log(
        "[MiPS] Pas de clé publique, impossible de charger les credentials",
      );
      this.credentialsLoaded = false;
      this.loadingCredentials = false;
      this.render();
      return false;
    }

    this.loadingCredentials = true;
    this.render();

    try {
      console.log(
        "[MiPS] Chargement des credentials pour la clé:",
        publicKey.substring(0, 20) + "...",
      );
      const res = await fetch(
        `${BACKEND}/api/merchant/get-credentials?public_key=${encodeURIComponent(publicKey)}`,
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log("[MiPS] Réponse du serveur:", data);

      if (data.success && data.credentials) {
        console.log("[MiPS] Credentials chargés avec succès ✅");

        // Mettre à jour les attributs avec les credentials récupérés
        if (data.credentials.id_merchant) {
          this.setAttribute(
            "id-merchant",
            String(data.credentials.id_merchant),
          );
          console.log(
            "[MiPS] id_merchant mis à jour:",
            data.credentials.id_merchant,
          );
        }
        if (data.credentials.id_entity) {
          this.setAttribute("id-entity", String(data.credentials.id_entity));
          console.log(
            "[MiPS] id_entity mis à jour:",
            data.credentials.id_entity,
          );
        }
        if (data.credentials.id_operator) {
          this.setAttribute(
            "id-operator",
            String(data.credentials.id_operator),
          );
          console.log(
            "[MiPS] id_operator mis à jour:",
            data.credentials.id_operator,
          );
        }
        if (data.credentials.operator_password) {
          this.setAttribute(
            "operator-password",
            data.credentials.operator_password,
          );
          console.log("[MiPS] operator_password mis à jour");
        }

        this.credentialsLoaded = true;
        this.error = "";
        this.render();
        return true;
      } else {
        console.log("[MiPS] Aucun credential trouvé pour cette clé publique");
        this.credentialsLoaded = false;
        this.error =
          "Aucune configuration trouvée pour cette clé publique. Veuillez d'abord configurer votre compte MiPS.";
        this.render();
        return false;
      }
    } catch (error) {
      console.error("[MiPS] Erreur chargement credentials:", error);
      this.credentialsLoaded = false;
      this.error = "Erreur de connexion au serveur. Veuillez réessayer.";
      this.render();
      return false;
    } finally {
      this.loadingCredentials = false;
      this.render();
    }
  }

  private get publicKey() {
    const key = this.getAttribute("public-key") || "";
    console.log(
      "[MiPS] get publicKey:",
      key ? key.substring(0, 20) + "..." : "vide",
    );
    return key;
  }

  private get buttonText() {
    return this.getAttribute("button-text") || "Payer avec MiPS";
  }

  private get buttonColor() {
    return this.getAttribute("button-color") || "#2563EB";
  }

  private get fixedAmount() {
    const amount = parseFloat(this.getAttribute("amount") || "0");
    if (amount > 0) return amount;
    return this.DEFAULT_FIXED_AMOUNT;
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

  private get idMerchant() {
    return this.getAttribute("id-merchant") || "";
  }

  private get idEntity() {
    return this.getAttribute("id-entity") || "";
  }

  private get idOperator() {
    return this.getAttribute("id-operator") || "";
  }

  private get operatorPassword() {
    return this.getAttribute("operator-password") || "";
  }

  private get amountSource() {
    return this.getAttribute("amount-source") || "cart";
  }

  private get amountSelector() {
    return this.getAttribute("amount-selector") || "";
  }

  private async getWixCartTotal(): Promise<{ amount: number; items: any[] }> {
    try {
      let retries = 0;
      while (!window.wix && retries < 10) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        retries++;
      }

      if (window.wix?.stores) {
        const cart = await window.wix.stores.getCurrentCart();
        const amount = cart.totalAmount || cart.totalPrice || 0;
        return {
          amount: amount > 0 ? amount : this.DEFAULT_FIXED_AMOUNT,
          items: cart.items || [],
        };
      }

      if (window.Wix?.Utils) {
        return new Promise((resolve) => {
          window.Wix.getCurrentCart((cart: any) => {
            const amount = cart.totalAmount || cart.totalPrice || 0;
            resolve({
              amount: amount > 0 ? amount : this.DEFAULT_FIXED_AMOUNT,
              items: cart.items || [],
            });
          });
        });
      }

      return { amount: this.DEFAULT_FIXED_AMOUNT, items: [] };
    } catch (error) {
      console.error("Erreur panier Wix:", error);
      return { amount: this.DEFAULT_FIXED_AMOUNT, items: [] };
    }
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
      setInterval(() => this.updateDynamicAmount(), 5000);
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
      btn.removeEventListener("click", () => {});
      btn.addEventListener("click", () => {
        this.showModal = false;
        this.render();
        this.attachEvents();
      });
    });
  }

  // MÉTHODE MODIFIÉE: handlePay avec vérification des credentials
  private async handlePay() {
    // Attendre un peu pour s'assurer que les credentials sont chargés
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Vérifier si les credentials sont disponibles
    const hasCredentials =
      this.idMerchant &&
      this.idEntity &&
      this.idOperator &&
      this.operatorPassword;

    console.log("[MiPS] Vérification credentials:", {
      hasCredentials,
      idMerchant: !!this.idMerchant,
      idEntity: !!this.idEntity,
      idOperator: !!this.idOperator,
      operatorPassword: !!this.operatorPassword,
      credentialsLoaded: this.credentialsLoaded,
      publicKeyExists: !!this.publicKey,
    });

    if (!hasCredentials) {
      let errorMsg = "";
      if (!this.publicKey) {
        errorMsg =
          "❌ Clé publique non configurée.\n\nVeuillez configurer votre clé publique MiPS dans les paramètres du widget.";
      } else if (this.loadingCredentials) {
        errorMsg =
          "⏳ Chargement de la configuration en cours...\n\nVeuillez patienter.";
      } else if (!this.credentialsLoaded) {
        errorMsg =
          "🔑 Configuration MiPS introuvable.\n\nVeuillez vérifier que :\n• Votre clé publique est correcte\n• Vous avez configuré votre compte MiPS\n• Les credentials ont été enregistrés dans le backend";
      } else {
        errorMsg =
          "⚠️ Credentials incomplets.\n\nVeuillez vérifier la configuration de votre compte MiPS.";
      }

      this.error = errorMsg;
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
        id_merchant: this.idMerchant,
        id_entity: this.idEntity,
        id_operator: this.idOperator,
        operator_password: this.operatorPassword,
        amount: this.dynamicAmount,
        title: this.paymentTitle,
        currency: this.currency,
        sending_mode: this.sendingMode,
        request_mode: this.requestMode,
        redirect_url: window.location.href,
      };

      console.log("[MiPS] Envoi de la requête de paiement avec credentials");

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
    const hasCredentials =
      this.idMerchant &&
      this.idEntity &&
      this.idOperator &&
      this.operatorPassword;

    this.shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: system-ui, -apple-system, Inter, sans-serif; }
        .container { 
          max-width: 400px; 
          width: 100%;
        }

        .error {
          color: #DC2626; 
          font-size: 13px; 
          margin-bottom: 8px;
          padding: 12px; 
          background: #FEE2E2; 
          border-radius: 6px;
          white-space: pre-line;
          text-align: center;
        }

        .warning {
          color: #D97706;
          font-size: 13px;
          margin-bottom: 8px;
          padding: 12px;
          background: #FEF3C7;
          border-radius: 6px;
          text-align: center;
        }

        .info {
          color: #3B82F6;
          font-size: 13px;
          margin-bottom: 8px;
          padding: 12px;
          background: #DBEAFE;
          border-radius: 6px;
          text-align: center;
        }

        .pay-btn {
          width: 100%; 
          padding: 14px; 
          border-radius: 10px; 
          border: none;
          background: ${this.loading ? "#93C5FD" : hasCredentials && hasPublicKey ? this.buttonColor : "#9CA3AF"};
          color: #fff; 
          font-size: 16px; 
          font-weight: 700;
          cursor: ${hasCredentials && hasPublicKey && !this.loading ? "pointer" : "not-allowed"};
          display: flex; 
          align-items: center; 
          justify-content: center; 
          gap: 8px;
          transition: all 0.2s;
          opacity: ${hasCredentials && hasPublicKey ? 1 : 0.6};
        }
        .pay-btn:hover:not(:disabled) { 
          opacity: 0.92; 
          transform: translateY(-1px); 
        }
        .pay-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .secure-badge {
          display: flex; 
          align-items: center; 
          justify-content: center;
          gap: 6px; 
          margin-top: 8px; 
          font-size: 11px; 
          color: #94A3B8;
        }

        .modal-overlay {
          position: fixed; 
          inset: 0; 
          background: rgba(0,0,0,0.5);
          display: flex; 
          align-items: center; 
          justify-content: center; 
          z-index: 9999;
        }
        .modal {
          background: #fff; 
          border-radius: 16px; 
          padding: 32px;
          max-width: 440px; 
          width: 90%; 
          text-align: center; 
          position: relative;
        }
        .modal-close {
          position: absolute; 
          top: 12px; 
          right: 16px;
          background: none; 
          border: none; 
          font-size: 20px; 
          cursor: pointer; 
          color: #64748B;
        }
        .modal h2 { 
          margin: 12px 0 8px; 
          font-size: 20px; 
        }
        .modal p { 
          color: #64748B; 
          font-size: 14px; 
          margin-bottom: 20px; 
        }
        .modal img {
          width: 160px; 
          height: 160px; 
          border: 1px solid #E2E8F0;
          border-radius: 8px; 
          margin: 0 auto 20px; 
          display: block;
        }
        .pay-link-btn {
          display: block; 
          padding: 14px; 
          border-radius: 10px;
          background: ${this.buttonColor}; 
          color: #fff;
          font-weight: 700; 
          font-size: 15px; 
          text-decoration: none; 
          margin-bottom: 12px;
        }
        .close-btn {
          width: 100%; 
          padding: 10px; 
          border-radius: 10px;
          border: 1.5px solid #E2E8F0; 
          background: #fff;
          cursor: pointer; 
          font-size: 14px; 
          color: #64748B;
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
            : this.loadingCredentials
              ? `
          <div class="info">
            ⏳ Chargement de votre configuration MiPS...<br/>
            <small>Veuillez patienter quelques instants.</small>
          </div>
        `
              : !hasCredentials && hasPublicKey
                ? `
          <div class="warning">
            ⚠️ Configuration en attente<br/><br/>
            Votre clé publique a été enregistrée mais la configuration complète est en cours de chargement.<br/>
            <small>Si le problème persiste, vérifiez que votre compte MiPS est correctement configuré.</small>
          </div>
        `
                : this.error
                  ? `
          <div class="error">❌ ${this.error}</div>
        `
                  : ""
        }

        <button 
          id="mips-pay-btn" 
          class="pay-btn" 
          ${this.loading || !hasCredentials || !hasPublicKey ? "disabled" : ""}
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

// Enregistrer le Web Component
if (!customElements.get("mips-pay")) {
  customElements.define("mips-pay", MipsPay);
}

// export default MipsPay;
