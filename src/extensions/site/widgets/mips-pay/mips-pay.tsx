const BACKEND = "https://f2c8-102-18-5-114.ngrok-free.app";

// Déclaration des types pour l'API Wix
declare global {
  interface Window {
    wix: any;
    Wix: any;
  }
}

class MipsPay extends HTMLElement {
  static get observedAttributes() {
    return [
      "button-text",
      "button-color",
      "amount",
      "currency",
      "payment-title",
      "site-id",
      "amount-source",
      "amount-selector",
    ];
  }

  private shadow: ShadowRoot;
  private loading = false;
  private error = "";
  private showModal = false;
  private paymentLink = "";
  private qrCode = "";
  private dynamicAmount = 200; // Valeur par défaut
  private cartItems: any[] = [];

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    this.render();
    this.attachEvents();

    // Récupérer le montant dynamique au chargement
    await this.updateDynamicAmount();

    // Écouter les changements du panier Wix
    this.listenToCartChanges();
  }

  attributeChangedCallback() {
    this.render();
    this.attachEvents();
  }

  private get buttonText() {
    return this.getAttribute("button-text") || "Payer avec MiPS";
  }

  private get buttonColor() {
    return this.getAttribute("button-color") || "#2563EB";
  }

  private get fixedAmount() {
    return parseFloat(this.getAttribute("amount") || "200"); // ← Changé: 200 au lieu de 0
  }

  private get currency() {
    return this.getAttribute("currency") || "MUR";
  }

  private get paymentTitle() {
    return this.getAttribute("payment-title") || "Paiement test";
  }

  private get siteId() {
    return this.getAttribute("site-id") || "test-site-id";
  }

  private get amountSource() {
    // Changé: "test" au lieu de "cart" pour forcer le mode test
    return this.getAttribute("amount-source") || "test";
  }

  private get amountSelector() {
    return this.getAttribute("amount-selector") || "";
  }

  /**
   * Récupère le montant total du panier Wix Stores
   */
  private async getWixCartTotal(): Promise<{ amount: number; items: any[] }> {
    try {
      let retries = 0;
      while (!window.wix && retries < 10) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        retries++;
      }

      if (window.wix && window.wix.stores) {
        const cart = await window.wix.stores.getCurrentCart();
        return {
          amount: cart.totalAmount || cart.totalPrice || 0,
          items: cart.items || [],
        };
      }

      if (window.Wix && window.Wix.Utils) {
        return new Promise((resolve) => {
          window.Wix.getCurrentCart((cart: any) => {
            resolve({
              amount: cart.totalAmount || cart.totalPrice || 0,
              items: cart.items || [],
            });
          });
        });
      }

      const cartTotalElement = document.querySelector(
        "[data-total], .cart-total, .total-price, .checkout-total",
      );
      if (cartTotalElement) {
        const text = cartTotalElement.textContent || "";
        const amount = parseFloat(text.replace(/[^0-9.-]/g, ""));
        return { amount: isNaN(amount) ? 200 : amount, items: [] };
      }

      return { amount: 200, items: [] }; // ← Changé: retourne 200 au lieu de 0
    } catch (error) {
      console.error("Error getting Wix cart total:", error);
      return { amount: 200, items: [] }; // ← Changé: retourne 200 au lieu de 0
    }
  }

  private getAmountFromSelector(): number {
    if (!this.amountSelector) return 0;
    try {
      const element = document.querySelector(this.amountSelector);
      if (element) {
        const text =
          element.textContent || element.getAttribute("data-amount") || "";
        const amount = parseFloat(text.replace(/[^0-9.-]/g, ""));
        return isNaN(amount) ? 200 : amount;
      }
    } catch (error) {
      console.error("Error getting amount from selector:", error);
    }
    return 200; // ← Changé: retourne 200 par défaut
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
        amount = this.fixedAmount;
        break;
      case "test":
        amount = 200; // Mode test forcé
        break;
      default:
        amount = 200; // Valeur par défaut pour les tests
    }

    this.dynamicAmount = amount > 0 ? amount : 200; // Force 200 si 0
    this.cartItems = items;

    console.log(
      `Montant mis à jour: ${this.dynamicAmount} ${this.currency} (source: ${this.amountSource})`,
    );

    this.render();
    this.attachEvents();
  }

  private listenToCartChanges(): void {
    window.addEventListener("message", async (event) => {
      if (event.data && event.data.type === "wixCartUpdated") {
        await this.updateDynamicAmount();
      }
    });

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

  private attachEvents() {
    const btn = this.shadow.getElementById("mips-pay-btn");
    if (btn) btn.onclick = () => this.handlePay();

    const closeBtn = this.shadow.getElementById("mips-modal-close");
    if (closeBtn)
      closeBtn.onclick = () => {
        this.showModal = false;
        this.render();
        this.attachEvents();
      };
  }

  private async handlePay() {
    const amountToPay = this.dynamicAmount > 0 ? this.dynamicAmount : 200;

    console.log("Tentative de paiement avec montant:", amountToPay);

    if (amountToPay === 0) {
      this.error = "Votre panier est vide ou le montant est invalide";
      this.render();
      this.attachEvents();
      return;
    }

    this.loading = true;
    this.error = "";
    this.render();
    this.attachEvents();

    try {
      const res = await fetch(`${BACKEND}/api/create-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wix_site_id: this.siteId,
          amount: amountToPay,
          title: this.paymentTitle,
          redirect_url: window.location.href,
          currency: this.currency,
          items: this.cartItems,
        }),
      });

      const data = await res.json();
      console.log("Réponse backend:", data);

      if (data.payment_link) {
        this.paymentLink = data.payment_link;
        this.qrCode = data.qr_code || "";
        this.showModal = true;
        this.error = "";
      } else {
        this.error = data.error || "Erreur lors de la création du paiement";
      }
    } catch (err: unknown) {
      console.error("Erreur paiement:", err);
      const errorMessage = err instanceof Error ? err.message : "Erreur réseau";
      this.error = `Erreur: ${errorMessage}`;
    }

    this.loading = false;
    this.render();
    this.attachEvents();
  }

  private getDisplayAmount(): string {
    const amount = this.dynamicAmount > 0 ? this.dynamicAmount : 200;
    if (amount === 0) return "";
    return `${amount.toFixed(2)} ${this.currency}`;
  }

  private getAmountSourceText(): string {
    switch (this.amountSource) {
      case "cart":
        return "montant de votre panier";
      case "selector":
        return "montant sélectionné";
      case "fixed":
        return "montant fixe";
      case "test":
        return "montant de test (200 MUR)";
      default:
        return "montant de test (200 MUR)";
    }
  }

  render() {
    const displayAmount = this.getDisplayAmount();
    const amountSourceText = this.getAmountSourceText();

    this.shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: Inter, sans-serif; }
        .container { max-width: 400px; }
        .error { color: #DC2626; font-size: 13px; margin-bottom: 8px; padding: 8px; background: #FEE2E2; border-radius: 6px; }
        .pay-btn {
          width: 100%; padding: 14px; border-radius: 10px; border: none;
          background: ${this.loading ? "#93C5FD" : this.buttonColor};
          color: #fff; font-size: 16px; font-weight: 700;
          cursor: ${this.loading ? "not-allowed" : "pointer"};
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all 0.2s;
        }
        .pay-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
        .secure-badge { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 8px; font-size: 11px; color: #94A3B8; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; }
        .modal { background: #fff; border-radius: 16px; padding: 32px; max-width: 440px; width: 90%; text-align: center; position: relative; }
        .modal-close { position: absolute; top: 12px; right: 16px; background: none; border: none; font-size: 20px; cursor: pointer; color: #64748B; }
        .modal h2 { margin: 12px 0 8px; font-size: 20px; }
        .modal p { color: #64748B; font-size: 14px; margin-bottom: 20px; }
        .modal img { width: 160px; height: 160px; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto; }
        .pay-link-btn { display: block; padding: 14px; border-radius: 10px; background: ${this.buttonColor}; color: #fff; font-weight: 700; font-size: 15px; text-decoration: none; margin-bottom: 12px; }
        .close-btn { width: 100%; padding: 10px; border-radius: 10px; border: 1.5px solid #E2E8F0; background: #fff; cursor: pointer; font-size: 14px; color: #64748B; }
        .info-text { font-size: 13px; color: #64748B; margin-bottom: 16px; text-align: center; }
        .amount-info { font-size: 12px; color: #10B981; text-align: center; margin-top: 8px; padding: 6px; background: #ECFDF5; border-radius: 6px; }
        .test-badge { font-size: 11px; color: #F59E0B; text-align: center; margin-top: 8px; padding: 4px; background: #FEF3C7; border-radius: 4px; }
      </style>

      <div class="container">
        <div class="info-text">💳 Paiement sécurisé MiPS - Montant: 200 MUR</div>
        ${this.error ? `<div class="error">❌ ${this.error}</div>` : ""}
        <button id="mips-pay-btn" class="pay-btn" ${this.loading ? "disabled" : ""}>
          ${this.loading ? "⏳ Traitement..." : `💳 ${this.buttonText} — 200.00 ${this.currency}`}
        </button>
        <div class="test-badge">🧪 MODE TEST - Montant fixe: 200 MUR</div>
        <div class="secure-badge">🔒 Paiement sécurisé via <strong>MiPS</strong></div>
      </div>

      ${
        this.showModal
          ? `
        <div class="modal-overlay">
          <div class="modal">
            <button id="mips-modal-close" class="modal-close">✕</button>
            <div style="font-size:40px">✅</div>
            <h2>Demande de paiement créée !</h2>
            <p>Montant: 200.00 ${this.currency}</p>
            ${this.qrCode ? `<img src="${this.qrCode}" alt="QR Code MiPS" />` : ""}
            <a href="${this.paymentLink}" target="_blank" class="pay-link-btn">🔗 Accéder à la page de paiement MiPS</a>
            <button id="mips-modal-close" class="close-btn">Fermer</button>
          </div>
        </div>
      `
          : ""
      }
    `;
  }
}

// Éviter le double enregistrement
if (!customElements.get("mips-pay")) {
  customElements.define("mips-pay", MipsPay);
}

export default MipsPay;
