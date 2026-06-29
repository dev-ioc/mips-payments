/**
 * mips-pay.ts — Widget de paiement MiPS pour Wix Studio
 *
 * URL stable à configurer dans Wix (ne change jamais) :
 *   https://features-mips-payments.dev-mdg.workers.dev/_wix_126f0f6e-custom-elements/mips-pay.js
 *
 * Stratégies de récupération du montant (dans l'ordre) :
 *  1. Lecture DOM directe
 *  2. Retry DOM toutes les 500ms pendant 10s
 *  3. API REST Wix directe (site publié)
 *  4. Au clic si toujours 0 → nouvelle tentative avant d'afficher l'erreur
 */

const MIPS_PROXY = "https://mips-payments-proxy.dev-mdg.workers.dev";
const WORKER_BASE = "https://features-mips-payments.dev-mdg.workers.dev";
const DERIVE_PASSPHRASE = "mips-wix-secure-2025";

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey(
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
    km,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function decryptCredentials(
  ciphertext: string,
): Promise<Record<string, string>> {
  const key = await deriveKey(DERIVE_PASSPHRASE);
  // ✅ Reconvertir base64url → base64 standard avant décodage
  const base64 = ciphertext
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(ciphertext.length + ((4 - (ciphertext.length % 4)) % 4), "=");
  const combined = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    key,
    combined.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

function generateOrderId(): string {
  return `WIX${Date.now().toString().slice(-10)}${Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()}`;
}

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

  private _veloAmount = 0;
  private _cartAmount = 0;
  private _initialized = false;
  private _cartRetryInterval: ReturnType<typeof setInterval> | null = null;
  private _domObserver: MutationObserver | null = null;

  private showCustomerForm = false;
  private customerFormErrors: string[] = [];
  private customerInfo = { firstName: "", lastName: "", phone: "", email: "" };

  private showIframe = false;
  private iframeUrl = "";
  private paymentId = "";

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  private get effectiveAmount(): number {
    if (this._veloAmount > 0) return this._veloAmount;
    if (this._cartAmount > 0) return this._cartAmount;
    return this.fixedAmount;
  }

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
    return this.getAttribute("currency") || "MGA";
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

  // ✅ Affiche "Ar" pour MGA, sinon le code devise
  private getDisplayAmount(): string {
    const amt = this.effectiveAmount;
    const displayCurrency = this.currency === "MGA" ? "Ar" : this.currency;
    return amt > 0
      ? `${amt.toFixed(2)} ${displayCurrency}`
      : `-- ${displayCurrency}`;
  }

  // ─── Cart / DOM ───────────────────────────────────────────────────────────

  private observeCartChanges() {
    const observer = new MutationObserver(() => {
      const newAmount = this.readAmountFromDOM();
      if (newAmount > 0 && newAmount !== this._cartAmount) {
        console.log(
          "🔄 Montant du panier changé:",
          newAmount,
          "(ancien:",
          this._cartAmount,
          ")",
        );
        this._cartAmount = newAmount;
        this.render();
        this.attachDOMEvents();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
    });
    this._domObserver = observer;
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this.render();
    this.attachDOMEvents();
    if (this.amountSource === "cart") this.loadCartAmount();
    this.listenToMessages();
    this.observeCartChanges();
  }

  disconnectedCallback() {
    if (this._cartRetryInterval) {
      clearInterval(this._cartRetryInterval);
      this._cartRetryInterval = null;
    }
    if (this._domObserver) {
      this._domObserver.disconnect();
      this._domObserver = null;
    }
  }

  attributeChangedCallback(name: string, oldVal: string, newVal: string) {
    if (!newVal || newVal === oldVal) return;
    if (name === "amount") {
      const parsed = parseFloat(newVal);
      if (!isNaN(parsed) && parsed >= 0) this._veloAmount = parsed;
    }
    if (this.isConnected) {
      this.render();
      this.attachDOMEvents();
    }
  }

  public setAmount(amount: number) {
    if (!isNaN(amount) && amount >= 0) {
      this._veloAmount = amount;
      this.render();
      this.attachDOMEvents();
    }
  }

  private async loadCartAmount(): Promise<void> {
    const { amount } = await this.getWixCartTotal();
    if (amount > 0 && this._veloAmount === 0) {
      this._cartAmount = amount;
      this.render();
      this.attachDOMEvents();
      return;
    }
    this.waitForCartAmountInDOM();
  }

  private async getWixCartTotal(): Promise<{ amount: number }> {
    const domAmount = this.readAmountFromDOM();
    if (domAmount > 0) {
      console.log("Montant trouvé dans le DOM:", domAmount);
      return { amount: domAmount };
    }
    const domAmountRetry = await this.waitForDomAmount();
    if (domAmountRetry > 0) return { amount: domAmountRetry };
    return { amount: this.fixedAmount };
  }

  private waitForDomAmount(maxAttempts = 10): Promise<number> {
    return new Promise((resolve) => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const amount = this.readAmountFromDOM();
        if (amount > 0 || attempts >= maxAttempts) {
          clearInterval(interval);
          resolve(amount);
        }
      }, 500);
    });
  }

  private async fetchCartViaWorkerProxy(): Promise<number> {
    try {
      const siteUrl = encodeURIComponent(window.location.origin);
      const url = `${WORKER_BASE}/api/cart-total?siteUrl=${siteUrl}`;
      const res = await fetch(url, {
        method: "GET",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return 0;
      const data = await res.json();
      const amount = parseFloat(String(data?.amount || 0));
      return isNaN(amount) ? 0 : amount;
    } catch (error) {
      console.error("Erreur proxy worker:", error);
      return 0;
    }
  }

  private async fetchCartFromWixAPI(): Promise<number> {
    const endpoints = [
      "/_api/wix-ecommerce-storefront-web/api/v1/cart",
      "/_api/stores/v1/cart",
      "/_api/wix-ecommerce-storefront-web/api/cart",
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          const total =
            data?.cart?.priceSummary?.total?.amount ||
            data?.cart?.totals?.total ||
            data?.totals?.total ||
            data?.cart?.total ||
            0;
          const parsed = parseFloat(String(total));
          if (!isNaN(parsed) && parsed > 0) return parsed;
        }
      } catch {
        /* tente le suivant */
      }
    }
    return 0;
  }

  private readAmountFromDOM(): number {
    try {
      const bodyText = document.body.innerText;
      const allAmounts = bodyText.match(/(\d+(?:[.,]\d+)?)\s*Ar/g);
      if (allAmounts && allAmounts.length > 0) {
        const lastAmountStr = allAmounts[allAmounts.length - 1];
        const match = lastAmountStr.match(/(\d+(?:[.,]\d+)?)/);
        if (match) {
          const amount = parseFloat(match[1].replace(",", "."));
          console.log(`✅ Montant trouvé: ${amount} Ar`);
          return amount;
        }
      }
      return 0;
    } catch (e) {
      console.error("Erreur lecture DOM:", e);
      return 0;
    }
  }

  private waitForCartAmountInDOM() {
    if (this._cartRetryInterval) return;
    let attempts = 0;
    this._cartRetryInterval = setInterval(async () => {
      attempts++;

      const workerAmount = await this.fetchCartViaWorkerProxy();
      if (workerAmount > 0 && this._veloAmount === 0) {
        this._cartAmount = workerAmount;
        clearInterval(this._cartRetryInterval!);
        this._cartRetryInterval = null;
        this.render();
        this.attachDOMEvents();
        return;
      }

      const apiAmount = await this.fetchCartFromWixAPI();
      if (apiAmount > 0 && this._veloAmount === 0) {
        this._cartAmount = apiAmount;
        clearInterval(this._cartRetryInterval!);
        this._cartRetryInterval = null;
        this.render();
        this.attachDOMEvents();
        return;
      }

      const domAmount = this.readAmountFromDOM();
      if (domAmount > 0 && this._veloAmount === 0) {
        this._cartAmount = domAmount;
        clearInterval(this._cartRetryInterval!);
        this._cartRetryInterval = null;
        this.render();
        this.attachDOMEvents();
        return;
      }

      if (attempts >= 20) {
        clearInterval(this._cartRetryInterval!);
        this._cartRetryInterval = null;
      }
    }, 500);
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  private listenToMessages() {
    window.addEventListener("message", async (ev) => {
      if (ev.data?.type === "wixCartUpdated" && this._veloAmount === 0) {
        const amt = parseFloat(String(ev.data.cartTotal || ev.data.total || 0));
        if (amt > 0) {
          this._cartAmount = amt;
          this.render();
          this.attachDOMEvents();
        } else {
          await this.loadCartAmount();
        }
      }

      const mipsOrigins = ["https://api.mips.mu", "https://mips.mu"];
      const fromMips = mipsOrigins.some((o) => ev.origin?.startsWith(o));

      if (
        ev.data?.type === "mips_payment_success" ||
        (fromMips &&
          (ev.data?.status === "completed" ||
            ev.data?.payment_status === "success"))
      )
        this.handlePaymentSuccess();

      if (
        ev.data?.type === "mips_payment_failed" ||
        (fromMips && ev.data?.status === "failed")
      )
        this.handlePaymentFailed();
    });
  }

  // ─── Credentials ──────────────────────────────────────────────────────────

  private async getCredentials(): Promise<Record<string, string> | null> {
    if (!this.encryptedCredentials) return null;
    try {
      return await decryptCredentials(this.encryptedCredentials);
    } catch (e) {
      console.error("Erreur déchiffrement:", e);
      this.error =
        "Erreur de déchiffrement des credentials. Veuillez les reconfigurer dans le panel.";
      return null;
    }
  }

  // ─── Paiement ─────────────────────────────────────────────────────────────

  private handlePay() {
    if (!this.hasCredentials) {
      this.error = "Configuration MiPS non configurée.";
      this.render();
      this.attachDOMEvents();
      return;
    }

    if (this.effectiveAmount <= 0) {
      this.loading = true;
      this.render();
      this.attachDOMEvents();
      this.getWixCartTotal().then(({ amount }) => {
        this.loading = false;
        if (amount > 0) {
          this._cartAmount = amount;
          this.error = "";
          this.showCustomerForm = true;
          this.customerFormErrors = [];
        } else {
          this.error = "Montant invalide ou panier vide.";
        }
        this.render();
        this.attachDOMEvents();
      });
      return;
    }

    this.error = "";
    this.showCustomerForm = true;
    this.customerFormErrors = [];
    this.render();
    this.attachDOMEvents();
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
        this.loading = false;
        this.render();
        this.attachDOMEvents();
        return;
      }

      // Validation que le déchiffrement a produit des valeurs sensées
      const expectedFields = [
        "id_merchant",
        "id_entity",
        "id_operator",
        "operator_password",
        "auth_basic_username",
        "auth_basic_password",
      ];
      const hasValidCreds = expectedFields.every(
        (f) => creds[f] && creds[f].length > 0,
      );
      // Détection de valeurs corrompues (chaînes aléatoires > 20 chars)
      const looksCorrupted = ["id_merchant", "id_entity", "id_operator"].some(
        (f) =>
          creds[f] &&
          creds[f].length > 20 &&
          /^[A-Za-z0-9]{20,}$/.test(creds[f]),
      );

      if (!hasValidCreds || looksCorrupted) {
        this.error =
          "Credentials invalides ou corrompus. Veuillez les reconfigurer dans le panel Wix.";
        this.loading = false;
        this.render();
        this.attachDOMEvents();
        return;
      }

      const id_order = generateOrderId();
      this.paymentId = id_order;
      const amount = this.effectiveAmount;
      const basicAuth = btoa(
        `${creds.auth_basic_username}:${creds.auth_basic_password}`,
      );

      const body = {
        authentify: {
          id_merchant: creds.id_merchant,
          id_entity: creds.id_entity,
          id_operator: creds.id_operator,
          operator_password: creds.operator_password,
        },
        order: {
          id_order,
          currency: this.currency,
          amount,
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

      const res = await fetch(`${MIPS_PROXY}/api/load_payment_zone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify(body),
      });

      const raw = await res.text();
      let mipsData: any;

      try {
        mipsData = JSON.parse(raw);
        console.log("Réponse MiPS:", JSON.stringify(mipsData, null, 2));
      } catch {
        console.log("Réponse MiPS (non-JSON):", raw.substring(0, 500));
        if (raw.includes("<iframe") || raw.includes("payment_zone")) {
          const iframeMatch = raw.match(/<iframe[^>]+src=["']([^"']+)["']/i);
          if (iframeMatch?.[1]) {
            this.iframeUrl = iframeMatch[1];
            this.showIframe = true;
            this.error = "";
            this.loading = false;
            this.render();
            this.attachDOMEvents();
            return;
          }
        }
        throw new Error(
          `Le serveur a retourné une réponse invalide (HTTP ${res.status})`,
        );
      }

      if (!res.ok) {
        throw new Error(
          mipsData.answer?.message ||
            mipsData.message ||
            `Erreur HTTP ${res.status}`,
        );
      }

      const opStatus =
        mipsData.answer?.operation_status || mipsData.operation_status;
      const paymentZoneData =
        mipsData.answer?.payment_zone_data || mipsData.payment_zone_data;

      if (opStatus !== "success") {
        throw new Error(
          mipsData.answer?.message ||
            mipsData.message ||
            "Erreur création paiement MiPS",
        );
      }
      if (!paymentZoneData) {
        throw new Error("Aucune zone de paiement retournée par MiPS");
      }

      const iframeMatch = paymentZoneData.match(
        /<iframe[^>]+src=["']([^"']+)["']/i,
      );
      this.iframeUrl =
        iframeMatch?.[1] ||
        URL.createObjectURL(new Blob([paymentZoneData], { type: "text/html" }));
      this.showIframe = true;
      this.error = "";
    } catch (err: any) {
      console.error("Erreur paiement:", err);
      this.error =
        err.message || "Erreur réseau. Vérifiez vos identifiants MiPS.";
    }

    this.loading = false;
    this.render();
    this.attachDOMEvents();
  }

  // ─── Succès / Échec ───────────────────────────────────────────────────────

  private handlePaymentSuccess() {
    this.showIframe = false;
    if (this.iframeUrl.startsWith("blob:")) URL.revokeObjectURL(this.iframeUrl);
    this.iframeUrl = "";
    this.error = "";
    const div = document.createElement("div");
    div.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999999;";
    div.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:32px;text-align:center;max-width:380px;width:90%;font-family:system-ui;">
        <div style="font-size:48px;color:#16a34a;">✓</div>
        <h2 style="margin:12px 0 8px;color:#1E293B">Paiement réussi !</h2>
        <p style="color:#64748B">Votre paiement de ${this.getDisplayAmount()} a été traité avec succès.</p>
        <p style="font-size:12px;color:#94A3B8;margin-top:6px">Référence : ${this.paymentId}</p>
        <button onclick="this.closest('[style*=fixed]').remove()"
          style="margin-top:20px;padding:10px 24px;background:#2563EB;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;">
          Fermer
        </button>
      </div>`;
    document.body.appendChild(div);
    this.render();
    this.attachDOMEvents();
  }

  private handlePaymentFailed() {
    this.showIframe = false;
    if (this.iframeUrl.startsWith("blob:")) URL.revokeObjectURL(this.iframeUrl);
    this.iframeUrl = "";
    this.error = "Le paiement a échoué. Veuillez réessayer.";
    this.render();
    this.attachDOMEvents();
  }

  // ─── Événements DOM ───────────────────────────────────────────────────────

  private attachDOMEvents() {
    const replace = (id: string, fn: () => void) => {
      const el = this.shadow.getElementById(id);
      if (!el) return;
      const nb = el.cloneNode(true);
      el.parentNode?.replaceChild(nb, el);
      nb.addEventListener("click", fn);
    };

    replace("mips-pay-btn", () => this.handlePay());
    replace("mips-confirm-pay", () => this.processPayment());
    replace("mips-cancel-form", () => {
      this.showCustomerForm = false;
      this.customerFormErrors = [];
      this.render();
      this.attachDOMEvents();
    });
    replace("mips-cancel-form-2", () => {
      this.showCustomerForm = false;
      this.customerFormErrors = [];
      this.render();
      this.attachDOMEvents();
    });
    replace("mips-iframe-close", () => {
      this.showIframe = false;
      if (this.iframeUrl.startsWith("blob:"))
        URL.revokeObjectURL(this.iframeUrl);
      this.iframeUrl = "";
      this.render();
      this.attachDOMEvents();
    });

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
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  render() {
    const displayAmount = this.getDisplayAmount();
    const color = this.buttonColor;
    const isReady = this.hasCredentials;

    const btnLabel = this.loading
      ? "Traitement en cours..."
      : this.effectiveAmount > 0
        ? `${this.buttonText} — ${displayAmount}`
        : this.buttonText;

    this.shadow.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        :host { display:block; width:100%; font-family:system-ui,-apple-system,sans-serif; }

        .msg-error {
          color:#DC2626; font-size:13px; margin-bottom:10px; padding:10px 14px;
          background:#FEF2F2; border:1px solid #FECACA; border-radius:8px;
          text-align:center; line-height:1.5;
        }
        .msg-warn {
          color:#92400E; font-size:12px; margin-bottom:10px; padding:8px 12px;
          background:#FFFBEB; border:1px dashed #F59E0B; border-radius:8px; text-align:center;
        }
        .pay-btn {
          width:100%; padding:14px 20px; border-radius:10px; border:none;
          background:${this.loading ? "#93C5FD" : color};
          color:#fff; font-size:15px; font-weight:700; letter-spacing:0.01em;
          cursor:${this.loading ? "wait" : "pointer"};
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition:opacity 0.2s, transform 0.15s; min-height:50px;
          box-shadow:0 2px 8px rgba(0,0,0,0.15); line-height:1.2;
        }
        .pay-btn:hover:not(:disabled) { opacity:.88; transform:translateY(-1px); }
        .pay-btn:active:not(:disabled) { transform:translateY(0); }
        .secure-badge {
          display:flex; align-items:center; justify-content:center;
          gap:5px; margin-top:8px; font-size:11px; color:#94A3B8;
        }
        .secure-badge strong { color:#64748B; }

        .overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.55);
          display:flex; align-items:center; justify-content:center;
          z-index:999999; padding:16px;
        }
        .modal {
          background:#fff; border-radius:20px; padding:28px 24px 24px;
          width:100%; max-width:420px; position:relative;
          box-shadow:0 20px 60px rgba(0,0,0,0.25); animation:slideUp .25s ease;
        }
        @keyframes slideUp {
          from { transform:translateY(16px); opacity:0; }
          to   { transform:translateY(0);    opacity:1; }
        }
        .modal-close {
          position:absolute; top:14px; right:16px; background:#F1F5F9; border:none;
          width:30px; height:30px; border-radius:50%; font-size:14px; cursor:pointer;
          color:#64748B; display:flex; align-items:center; justify-content:center;
        }
        .modal-close:hover { background:#E2E8F0; }
        .modal-title    { font-size:17px; font-weight:700; color:#1E293B; text-align:center; margin-bottom:4px; }
        .modal-subtitle { font-size:13px; color:#94A3B8; text-align:center; margin-bottom:16px; }
        .amount-badge {
          background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px;
          padding:10px 14px; text-align:center; margin-bottom:18px;
          font-size:13px; color:#64748B;
        }
        .amount-badge span { font-size:22px; font-weight:800; color:${color}; display:block; margin-top:3px; }
        .form-errors {
          background:#FEF2F2; border:1px solid #FECACA; border-radius:8px;
          padding:10px 14px; margin-bottom:14px;
        }
        .form-errors p { color:#DC2626; font-size:12px; margin:2px 0; }
        .form-row { display:flex; gap:10px; }
        .form-group { margin-bottom:12px; flex:1; }
        .form-group label {
          display:block; font-size:11px; font-weight:700; color:#475569;
          margin-bottom:5px; text-transform:uppercase; letter-spacing:0.04em;
        }
        .form-group input {
          width:100%; padding:10px 12px; border:1.5px solid #E2E8F0;
          border-radius:8px; font-size:14px; outline:none; color:#1E293B;
          background:#fff; font-family:inherit;
          transition:border-color .2s,box-shadow .2s;
        }
        .form-group input:focus { border-color:${color}; box-shadow:0 0 0 3px ${color}22; }
        .form-group input::placeholder { color:#CBD5E1; }
        .confirm-btn {
          width:100%; padding:13px; border-radius:10px; border:none;
          background:${color}; color:#fff; font-size:15px; font-weight:700;
          cursor:pointer; margin-bottom:8px; font-family:inherit;
          box-shadow:0 2px 8px rgba(0,0,0,0.15); transition:opacity .2s;
        }
        .confirm-btn:hover { opacity:.9; }
        .cancel-btn {
          width:100%; padding:10px; border-radius:10px;
          border:1.5px solid #E2E8F0; background:#fff; cursor:pointer;
          font-size:14px; color:#64748B; font-family:inherit;
        }
        .cancel-btn:hover { background:#F8FAFC; }

        .iframe-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.65);
          display:flex; align-items:center; justify-content:center;
          z-index:999999; padding:12px;
        }
        .iframe-container {
          background:#fff; border-radius:16px; overflow:hidden;
          width:min(600px,100%); max-height:92vh;
          display:flex; flex-direction:column;
          box-shadow:0 24px 80px rgba(0,0,0,0.35);
        }
        .iframe-header {
          display:flex; align-items:center; justify-content:space-between;
          padding:14px 20px; border-bottom:1px solid #E2E8F0;
          background:#F8FAFC; flex-shrink:0;
        }
        .iframe-header-title { font-size:14px; font-weight:600; color:#374151; }
        .iframe-close {
          background:#E2E8F0; border:none; width:28px; height:28px;
          border-radius:50%; font-size:13px; cursor:pointer; color:#64748B;
          display:flex; align-items:center; justify-content:center;
        }
        .iframe-close:hover { background:#CBD5E1; }
        .iframe-body { flex:1; overflow:auto; min-height:500px; background:#fff; }
        .iframe-body iframe { width:100%; height:500px; border:none; display:block; }
      </style>

      <div>
        ${!isReady ? `<div class="msg-warn">⚙ Configurez vos credentials MiPS dans le panel du widget</div>` : ""}
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
              <input id="mips-phone" type="tel" placeholder="+261 34 xx xxx xx" autocomplete="tel" />
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
              <iframe
                src="${this.iframeUrl}"
                title="Paiement MiPS"
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
