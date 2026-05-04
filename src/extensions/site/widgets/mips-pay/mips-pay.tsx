const BACKEND = "https://mips-wix-backend.onrender.com";

// declare global {
//   interface Window {
//     wix: any;
//     Wix: any;
//     wixEmbedsAPI: any;
//   }
// }
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

  private readonly DEFAULT_FIXED_AMOUNT = 2000;
  private readonly DEFAULT_PUBLIC_KEY = "";

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    this.render();
    this.attachEvents();
    await this.updateDynamicAmount();
    this.listenToCartChanges();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    this.render();
    this.attachEvents();
  }

  private get publicKey() {
    let key = this.getAttribute("public-key") || "";

    if (!key && typeof window !== "undefined") {
      key = (window as any).MIPS_PUBLIC_KEY || "";
      if (key) {
        console.log("Clé chargée depuis variable globale");
      }
    }

    if (!key) {
      key = this.DEFAULT_PUBLIC_KEY;
    }
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

  private async handlePay() {
    const currentPublicKey = this.publicKey;
    if (!currentPublicKey) {
      this.error =
        "Widget non configuré. Veuillez configurer votre clé publique.";
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
      const res = await fetch(`${BACKEND}/api/create-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: currentPublicKey,
          amount: this.dynamicAmount,
          title: this.paymentTitle,
          redirect_url: window.location.href,
        }),
      });

      const data = await res.json();
      console.log("📥 Réponse backend:", data);

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
      console.error("Erreur:", err);
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
          padding: 8px; 
          background: #FEE2E2; 
          border-radius: 6px;
        }

        .pay-btn {
          width: 100%; 
          padding: 14px; 
          border-radius: 10px; 
          border: none;
          background: ${this.loading ? "#93C5FD" : this.buttonColor};
          color: #fff; 
          font-size: 16px; 
          font-weight: 700;
          cursor: pointer;
          display: flex; 
          align-items: center; 
          justify-content: center; 
          gap: 8px;
          transition: all 0.2s;
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
        ${this.error ? `<div class="error">❌ ${this.error}</div>` : ""}

        <button id="mips-pay-btn" class="pay-btn" ${this.loading ? "disabled" : ""}>
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
