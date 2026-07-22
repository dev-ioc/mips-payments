#MiPS Payments — Widget de paiement pour Wix
Widget de paiement (Custom Element Wix) permettant aux marchands d'accepter des paiements en ligne via la plateforme MiPS (Mastercard & Visa), directement depuis leur site Wix.
App Market Wix : https://www.wix.com/app-market/mips-payments
Statut : Publié (v2.98)
#Sommaire:
  Architecture
  Prérequis
  Installation
  Variables d'environnement
  Lancement en local
  Structure du projet
  Déploiement
  Sécurité
  Dépannage
  Contribuer / Maintenance

#Architecture
L'application ne comporte pas de backend applicatif séparé ni de base de données : 
le widget appelle directement l'API MiPS via un proxy Cloudflare Worker (nécessaire pour contourner les restrictions CORS et relayer l'authentification Basic Auth).
Flux résumé :
Marchand (panneau Wix) --chiffre--> encrypted-credentials (prop du widget, stocké par Wix)
Acheteur (widget sur le site) --déchiffre en local--> credentials en clair (jamais envoyés tels quels)
   --> requête vers le Proxy Cloudflare Worker --> API MiPS (api.mips.mu)
   --> iframe de paiement sécurisée retournée par MiPS

#Prérequis
Node.js: >= 18
npm
Wix CLI — pour lancer/tester l'app en environnement de développement Wix
Un compte Cloudflare (Workers) — utilisé comme fournisseur cloud de l'app Wix, et pour le proxy MiPS
Wrangler CLI — utilisé en tâche de fond par le Wix CLI (dossier .wrangler/) et pour déployer le proxy MiPS séparément
Des identifiants de test MiPS (fournis par l'équipe MiPS — voir section Sécurité)

#Installation
bash
# Cloner le dépôt
git clone https://github.com/dev-ioc/mips-payments
cd mips-payments

# Installer les dépendances
npm install
Le widget et le panneau de configuration font partie du même projet Astro/Wix CLI (voir Structure du projet) : une seule installation suffit.

#Variables d'environnement:
Créez un fichier .env à la racine (ou dans chaque sous-projet concerné) à partir du fichier d'exemple :
bash
cp .env.example .env

Variable	             |        Description
WIX_CLOUD_PROVIDER     :	Fournisseur cloud utilisé pour héberger l'app Wix (CLOUD_FLARE)
WIX_CLIENT_ID	         :  Identifiant client de l'app Wix (Dev Center)
WIX_APP_ID	           :  Identifiant de l'application dans le Wix App Market
WIX_CLIENT_INSTANCE_ID :	Identifiant d'instance client (fourni par Wix selon l'environnement)
WIX_CLIENT_PUBLIC_KEY  :	Clé publique utilisée par Wix pour vérifier les requêtes/webhooks signés par l'app
WIX_CLIENT_SECRET	     :  Secret client de l'app Wix — sensible, utilisé pour l'authentification côté Wix Dev Center
MIPS_API_URL	         :  URL de l'API MiPS (https://api.mips.mu)
MIPS_PROXY_URL	       :  URL du proxy Cloudflare Worker exposé au widget (ex. mips-payments-proxy.<compte>.workers.dev)
CLOUDFLARE_ACCOUNT_ID	 :  Identifiant du compte Cloudflare (pour le déploiement des Workers)
CLOUDFLARE_API_TOKEN	 :  Token API Cloudflare

Lancement en local
bash
# Lancer le projet Wix (widget + panneau) en mode développement
npm run dev
Le widget (mips-pay.tsx) et le panneau (mips-pay.panel.tsx) sont servis localement via le Wix CLI — suivez l'URL de prévisualisation fournie dans le terminal pour tester vos changements dans l'éditeur Wix.

#Structure du projet
Le projet est un monorepo unique géré via le Wix CLI (build Astro), et non plusieurs repos séparés :
mips-payments/
├── .wix/                          # Config Wix CLI
├── .wrangler/                     # Config/cache Cloudflare Wrangler
├── dist/                          # Build de sortie
├── public/                        # Assets statiques
├── src/
│   ├── components/                # Composants partagés
│   ├── extensions/                # Extensions Wix (widgets, dashboard)
│   │   ├── dashboard/             # Dashboard marchand (app Wix)
│   │   └── site/
│   │       └── widgets/
│   │           └── mips-pay/      # Widget de paiement MiPS
│   │               ├── mips-pay.extension.ts   # Déclaration de l'extension (Custom Element)
│   │               ├── mips-pay.module.css     # Styles du widget
│   │               ├── mips-pay.panel.tsx      # Panneau de configuration (credentials, apparence…)
│   │               └── mips-pay.tsx            # Composant du widget (bouton + formulaire de paiement)
│   ├── layouts/                   # Layouts Astro
│   ├── lib/                       # Fonctions utilitaires (chiffrement, helpers…)
│   ├── pages/                     # Pages Astro
│   ├── styles/                    # Styles globaux
│   ├── env.d.ts                   # Typage des variables d'environnement
│   └── extensions.ts              # Registre des extensions Wix
├── .env.exempl                    # Exemple de variables d'environnement
├── .env.local                     # Variables d'environnement locales (non committées)
├── astro.config.mjs
├── components.json
├── declarations.d.ts
├── package.json / package-lock.json
├── postcss.config.js
├── tailwind.config.js
└── README.md

Le proxy Cloudflare Worker n'est pas versionné dans ce dépôt — voir la section Proxy Cloudflare Worker ci-dessous pour savoir où le trouver et comment le modifier.
Proxy Cloudflare Worker
Le proxy qui relaie les appels du widget vers https://api.mips.mu (gestion CORS + transmission de l'Authorization Basic) n'est pas géré dans ce dépôt Git. 
Son code source est édité et déployé directement depuis le dashboard Cloudflare.
URL du Worker : https://mips-payments-proxy.dev-mdg.workers.dev
Accès : dash.cloudflare.com → se connecter via Continue with GitHub avec le compte GitHub lié au dépôt dev-ioc/mips-payments → Workers & Pages → mips-payments-proxy
Édition du code : onglet Edit code (éditeur en ligne Cloudflare) → modifier → Save and Deploy
Endpoints exposés :
POST /api/load_payment_zone — transmet la requête de création de paiement à MiPS
GET /api/cart-total — endpoint de fallback (actuellement renvoie { amount: 0 }, non implémenté côté panier réel)

#Déploiement
Le widget et le panneau de configuration sont déployés automatiquement par Cloudflare Pages/Workers, connecté au dépôt GitHub du projet : 
chaque git push sur la branche configurée (ex. main) déclenche un build et un déploiement automatique, sans commande manuelle à lancer.
Composant	                                           Déclenchement	                                                              Plateforme
Widget (Custom Element)	                             Déploiement automatique à chaque push sur GitHub (build CI Cloudflare).	    Cloudflare Workers
Panneau de configuration	                           Déploiement automatique à chaque push sur GitHub (build CI Cloudflare)	      Cloudflare Workers
Proxy MiPS	                                         Édition + Save and Deploy dans le dashboard                                  Cloudflare Workers
                                                    Cloudflare (voir Proxy Cloudflare Worker)	         

Récupérer le Script URL et le Panel URL après un déploiement
Après chaque déploiement automatique, les URLs finales (Script URL du widget et Panel URL du panneau) doivent être récupérées manuellement dans les logs de build Cloudflare :
  1-dash.cloudflare.com → se connecter via Continue with GitHub avec le compte GitHub lié au dépôt dev-ioc/mips-payments → Workers & Pages
  2-Ouvrir le projet correspondant (widget ou panneau) → onglet Deployments
  3-Ouvrir le déploiement le plus récent → consulter les logs de build pour repérer les URLs générées
  4-Copier le Script URL (widget) et le Panel URL (panneau de configuration)
  5-Aller dans le tableau de bord Wix (Develop > Extensions > Custom Element) et mettre à jour ces deux URLs avec les nouvelles valeurs
  6-Republier une nouvelle version de l'app via Publish to App Market si le changement doit être livré aux marchands
Si les URLs ne sont pas mises à jour côté Wix après un déploiement, le site des marchands continuera de pointer vers l'ancienne version déployée (ou une URL invalide selon la configuration Cloudflare).
#Sécurité
  1-Les credentials MiPS de chaque marchand sont chiffrés en AES-256-GCM (clé dérivée par PBKDF2) directement dans le navigateur, au moment de la saisie dans le panneau de configuration.
  2-Le résultat chiffré est stocké comme propriété du widget Wix (encrypted-credentials) — il n'existe aucune base de données ni backend applicatif intermédiaire.
  3-Le déchiffrement n'a lieu que côté client (navigateur de l'acheteur), au moment de lancer le paiement.
  4-Aucune donnée bancaire (numéro de carte, CVV) n'est stockée par l'application : le paiement s'effectue via une iframe sécurisée hébergée directement par MiPS.
  5-Le proxy Cloudflare Worker ne fait que relayer la requête (headers + body) vers api.mips.mu ; il ne persiste aucune donnée.
  6-Ne jamais logger ou exposer les credentials déchiffrés, y compris dans les logs du proxy.

#Dépannage
Problème	                                            Cause probable	                                                                                 Solution
Erreur HTTP 500 lors du paiement	                    Problème réseau entre le widget, le proxy Cloudflare et l'API MiPS	                             Vérifier les logs du Worker proxy (wrangler tail), tester l'API MiPS directement via curl/Postman
Bouton inactif / "Configuration MiPS non configurée"	Credentials non renseignés par le marchand dans le panneau	                                     Configurer les credentials dans le panneau du widget
Erreur de déchiffrement des credentials	              Propriété encrypted-credentials corrompue ou absente	                                           Reconfigurer les credentials depuis le panneau
Erreur 401 Unauthorized (API MiPS)	                  Credentials de test expirés ou invalides	                                                       Contacter l'équipe MiPS pour renouveler les identifiants de test


#Contribuer / Maintenance
  1-Créer une branche depuis main : git checkout -b fix/nom-du-correctif
  2-Effectuer vos modifications et les tester en local
  3-Ouvrir une pull request avec une description claire du changement
  4-Une fois mergé, déployer (widget + proxy) et vérifier en environnement de test avant de publier une nouvelle version sur le Wix App Market


  Mainteneur : DEV MDG — dev_mdg@caspeo.fr Client : MIPS IT Digital Ltd

