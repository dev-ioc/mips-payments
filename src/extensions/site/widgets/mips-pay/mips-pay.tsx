const BACKEND = "https://0464-102-18-5-16.ngrok-free.app";

// Déclaration des types pour l'API Wix
declare global {
  interface Window {
    wix: any;
    Wix: any;
    wixEmbedsAPI: any;
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
  private dynamicAmount = 200;
  private cartItems: any[] = [];
  private siteIdResolved = "";

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    // Récupérer le site ID
    this.siteIdResolved = await this.getSiteId();
    console.log("Site ID résolu:", this.siteIdResolved);

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
    return parseFloat(this.getAttribute("amount") || "200");
  }

  private get currency() {
    return this.getAttribute("currency") || "MUR";
  }

  private get paymentTitle() {
    return this.getAttribute("payment-title") || "Paiement test";
  }

  private get amountSource() {
    return this.getAttribute("amount-source") || "test";
  }

  private get amountSelector() {
    return this.getAttribute("amount-selector") || "";
  }

  // ── Site ID dynamique (méthode async) ──
  private async getSiteId(): Promise<string> {
    console.log("🔍 Début de la recherche du Site ID...");

    // Méthode 1 — Attribut HTML
    const attrId = this.getAttribute("site-id");
    if (attrId && attrId.length > 10) {
      console.log("✅ Site ID via attribut HTML:", attrId);
      return attrId;
    }

    // Méthode 2 — Query params de l'URL
    const params = new URLSearchParams(window.location.search);
    const paramId =
      params.get("metaSiteId") || params.get("siteId") || params.get("site_id");
    if (paramId && paramId.length > 10) {
      console.log("✅ Site ID via query param:", paramId);
      return paramId;
    }

    // Méthode 3 — Referrer (page parente)
    if (document.referrer && document.referrer.length > 0) {
      console.log("📎 Referrer détecté:", document.referrer);

      try {
        const refUrl = new URL(document.referrer);
        const refMetaSiteId = refUrl.searchParams.get("metaSiteId");
        if (refMetaSiteId && refMetaSiteId.length > 10) {
          console.log("✅ Site ID via referrer:", refMetaSiteId);
          return refMetaSiteId;
        }
      } catch (e) {}

      const uuidMatch = document.referrer.match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      );
      if (uuidMatch && uuidMatch[1]) {
        console.log("✅ Site ID via referrer UUID:", uuidMatch[1]);
        return uuidMatch[1];
      }
    }

    // Méthode 4 — wixEmbedsAPI (Custom Elements)
    if (window.wixEmbedsAPI) {
      try {
        const platformData = await window.wixEmbedsAPI.getPlatformData();
        const siteId = platformData?.site?.instanceId || platformData?.site?.id;
        if (siteId && siteId.length > 10) {
          console.log("✅ Site ID via wixEmbedsAPI:", siteId);
          return siteId;
        }
      } catch (e) {
        console.warn("Erreur wixEmbedsAPI:", e);
      }
    }

    // Méthode 5 — window.wix (SDK moderne)
    if (window.wix?.site?.getSiteId) {
      try {
        const id = await window.wix.site.getSiteId();
        if (id && id.length > 10) {
          console.log("✅ Site ID via window.wix:", id);
          return id;
        }
      } catch (e) {
        console.warn("wix.site.getSiteId échoué:", e);
      }
    }

    // Méthode 6 — window.Wix (SDK legacy)
    if (window.Wix?.getSiteInfo) {
      try {
        const id = await new Promise<string>((resolve) => {
          window.Wix.getSiteInfo((info: any) => {
            resolve(info?.siteId || info?.instanceId || "");
          });
        });
        if (id && id.length > 10) {
          console.log("✅ Site ID via Wix.getSiteInfo:", id);
          return id;
        }
      } catch (e) {
        console.warn("Wix.getSiteInfo échoué:", e);
      }
    }

    // Méthode 7 — window.Wix.Utils legacy
    if (window.Wix?.Utils?.getInstanceId) {
      try {
        const id = window.Wix.Utils.getInstanceId();
        if (id && id.length > 10) {
          console.log("✅ Site ID via Wix.Utils.getInstanceId:", id);
          return id;
        }
      } catch (e) {
        console.warn("Wix.Utils échoué:", e);
      }
    }

    console.error("❌ Aucune méthode n'a trouvé le Site ID");

    // Afficher une interface de configuration si nécessaire
    if (
      window.location.href.includes("editor.wix.com") ||
      document.referrer.includes("editor.wix.com")
    ) {
      console.warn("⚠️ Mode preview - Utilisation d'un ID temporaire");
      return "preview-mode-test";
    }

    return "";
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

      if (window.wix?.stores) {
        const cart = await window.wix.stores.getCurrentCart();
        return {
          amount: cart.totalAmount || cart.totalPrice || 200,
          items: cart.items || [],
        };
      }

      if (window.Wix?.Utils) {
        return new Promise((resolve) => {
          window.Wix.getCurrentCart((cart: any) => {
            resolve({
              amount: cart.totalAmount || cart.totalPrice || 200,
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

      return { amount: 200, items: [] };
    } catch (error) {
      console.error("Error getting Wix cart total:", error);
      return { amount: 200, items: [] };
    }
  }

  private getAmountFromSelector(): number {
    if (!this.amountSelector) return 200;
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
    return 200;
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
        amount = 200;
        break;
      default:
        amount = 200;
    }

    this.dynamicAmount = amount > 0 ? amount : 200;
    this.cartItems = items;

    this.render();
    this.attachEvents();
  }

  private listenToCartChanges(): void {
    window.addEventListener("message", async (event) => {
      if (event.data && event.data.type === "wixCartUpdated") {
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
    console.log("Site ID utilisé:", this.siteIdResolved);

    if (amountToPay === 0) {
      this.error = "Votre panier est vide ou le montant est invalide";
      this.render();
      this.attachEvents();
      return;
    }

    if (!this.siteIdResolved) {
      this.error = "Site ID non trouvé. Veuillez recharger la page.";
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
          wix_site_id: this.siteIdResolved,
          amount: amountToPay,
          title: this.paymentTitle,
          redirect_url: window.location.href,
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
    return `${amount.toFixed(2)} ${this.currency}`;
  }

  render() {
    const displayAmount = this.getDisplayAmount();

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
        .site-id-badge { font-size: 10px; color: #94A3B8; text-align: center; margin-top: 4px; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; }
        .modal { background: #fff; border-radius: 16px; padding: 32px; max-width: 440px; width: 90%; text-align: center; position: relative; }
        .modal-close { position: absolute; top: 12px; right: 16px; background: none; border: none; font-size: 20px; cursor: pointer; color: #64748B; }
        .modal h2 { margin: 12px 0 8px; font-size: 20px; }
        .modal p { color: #64748B; font-size: 14px; margin-bottom: 20px; }
        .modal img { width: 160px; height: 160px; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto; }
        .pay-link-btn { display: block; padding: 14px; border-radius: 10px; background: ${this.buttonColor}; color: #fff; font-weight: 700; font-size: 15px; text-decoration: none; margin-bottom: 12px; }
        .close-btn { width: 100%; padding: 10px; border-radius: 10px; border: 1.5px solid #E2E8F0; background: #fff; cursor: pointer; font-size: 14px; color: #64748B; }
        .test-badge { font-size: 11px; color: #F59E0B; text-align: center; margin-top: 8px; padding: 4px; background: #FEF3C7; border-radius: 4px; }
      </style>

      <div class="container">
        ${this.error ? `<div class="error">❌ ${this.error}</div>` : ""}
        <button id="mips-pay-btn" class="pay-btn" ${this.loading ? "disabled" : ""}>
          ${this.loading ? "⏳ Traitement..." : `💳 ${this.buttonText} — ${displayAmount}`}
        </button>
        <div class="secure-badge">Paiement sécurisé via <strong>MiPS</strong></div>
        ${
          this.siteIdResolved
            ? `<div class="site-id-badge">Site: ${this.siteIdResolved.slice(0, 8)}...</div>`
            : `<div class="site-id-badge" style="color:#DC2626">⚠️ Site ID non résolu</div>`
        }
      </div>

      ${
        this.showModal
          ? `
        <div class="modal-overlay">
          <div class="modal">
            <button id="mips-modal-close" class="modal-close">✕</button>
            <div style="font-size:40px">✅</div>
            <h2>Demande de paiement créée !</h2>
            <p>Montant: ${displayAmount}</p>
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
