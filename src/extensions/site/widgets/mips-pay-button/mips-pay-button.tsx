const BACKEND = "https://modem-oakland-incoming-identifies.trycloudflare.com";
class MipsPayButton extends HTMLElement {
  static get observedAttributes() {
    return [
      "button-text",
      "button-color",
      "amount",
      "currency",
      "payment-title",
      "site-id",
    ];
  }

  private shadow: ShadowRoot;
  private loading = false;
  private error = "";
  private showModal = false;
  private paymentLink = "";
  private qrCode = "";
  private form = { first_name: "", last_name: "", email: "", phone: "" };

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    this.attachEvents();
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

  private get amount() {
    return parseFloat(this.getAttribute("amount") || "0");
  }

  private get currency() {
    return this.getAttribute("currency") || "MUR";
  }

  private get paymentTitle() {
    return this.getAttribute("payment-title") || "Paiement";
  }

  private get siteId() {
    return this.getAttribute("site-id") || "";
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

    ["first_name", "last_name", "email", "phone"].forEach((field) => {
      const input = this.shadow.getElementById(
        `mips-${field}`,
      ) as HTMLInputElement;
      if (input) {
        input.value = this.form[field as keyof typeof this.form];
        input.oninput = (e) => {
          this.form[field as keyof typeof this.form] = (
            e.target as HTMLInputElement
          ).value;
        };
      }
    });
  }

  private async handlePay() {
    if (!this.form.first_name || !this.form.email) {
      this.error = "Prénom et email sont requis";
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
          amount: this.amount,
          title: this.paymentTitle,
          client_first_name: this.form.first_name,
          client_last_name: this.form.last_name,
          client_email: this.form.email,
          client_phone: this.form.phone,
          redirect_url: window.location.href,
        }),
      });

      const data = await res.json();

      if (data.payment_link) {
        this.paymentLink = data.payment_link;
        this.qrCode = data.qr_code || "";
        this.showModal = true;
        this.error = "";
      } else {
        this.error = data.error || "Erreur lors de la création du paiement";
      }
    } catch {
      this.error = "Erreur réseau. Veuillez réessayer.";
    }

    this.loading = false;
    this.render();
    this.attachEvents();
  }

  render() {
    this.shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: Inter, sans-serif; }
        .container { max-width: 400px; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1.5px solid #E2E8F0;
          font-size: 14px;
          outline: none;
          margin-bottom: 10px;
          transition: border-color 0.2s;
        }
        input:focus { border-color: ${this.buttonColor}; }
        .error {
          color: #DC2626;
          font-size: 13px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 4px;
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
          cursor: ${this.loading ? "not-allowed" : "pointer"};
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 14px ${this.buttonColor}40;
          transition: all 0.2s;
        }
        .pay-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
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
        .modal h2 { margin: 12px 0 8px; font-size: 20px; }
        .modal p { color: #64748B; font-size: 14px; margin-bottom: 20px; }
        .modal img { width: 160px; height: 160px; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 20px; }
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
        <div class="form-row">
          <input id="mips-first_name" type="text" placeholder="Prénom *" />
          <input id="mips-last_name" type="text" placeholder="Nom" />
        </div>
        <input id="mips-email" type="email" placeholder="Email *" />
        <input id="mips-phone" type="tel" placeholder="Téléphone" />

        ${this.error ? `<div class="error">⚠️ ${this.error}</div>` : ""}

        <button id="mips-pay-btn" class="pay-btn" ${this.loading ? "disabled" : ""}>
          ${
            this.loading
              ? "<span>⏳</span><span>Traitement...</span>"
              : `
            <span>💳</span>
            <span>${this.buttonText}</span>
            ${this.amount > 0 ? `<span style="opacity:0.85">— ${this.amount.toFixed(2)} ${this.currency}</span>` : ""}
          `
          }
        </button>

        <div class="secure-badge">
          🔒 <span>Paiement sécurisé via</span>
          <strong style="color:#64748B">MiPS</strong>
        </div>
      </div>

      ${
        this.showModal
          ? `
        <div class="modal-overlay">
          <div class="modal">
            <button id="mips-modal-close" class="modal-close">✕</button>
            <div style="font-size:40px">✅</div>
            <h2>Paiement créé !</h2>
            <p>Cliquez sur le lien ou scannez le QR code pour finaliser votre paiement.</p>
            ${this.qrCode ? `<img src="${this.qrCode}" alt="QR Code MiPS" />` : ""}
            <a href="${this.paymentLink}" target="_blank" class="pay-link-btn">
              🔗 Accéder à la page de paiement
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

customElements.define("mips-pay-button", MipsPayButton);

export default MipsPayButton;
