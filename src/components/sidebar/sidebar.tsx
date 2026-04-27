import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CreditCard, Key, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const BACKEND = import.meta.env.PROD
  ? "https://8f3a-102-18-5-190.ngrok-free.app"
  : "http://localhost:3000";

const menu = [
  {
    items: [
      { name: "Credentials MIPS", icon: Key, href: "/credentialls-page" },
      // { name: "Statistiques", icon: BarChart, href: "/dashboard" },
      { name: "Mes paiements", icon: CreditCard, href: "/dashboard" },
      // { name: "Factures", icon: FileText, href: "/invoices" },
      // { name: "Notifications", icon: Bell, href: "/notification" },
    ],
  },
];

function SidebarContent() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pathname, setPathname] = useState("/");

  const fetchUser = async () => {
    try {
      const token = localStorage.getItem("token");

      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${BACKEND}/api/user`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.warn("Token expiré ou invalide");
          localStorage.removeItem("token");
          setUser(null);
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setUser(data.user || data);
    } catch (err) {
      console.error("Erreur récupération utilisateur:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPathname(window.location.pathname);
    fetchUser();
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/";
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 flex flex-col items-center justify-center gap-2 border-b text-center">
        <img
          src="assets/mips-logo.png"
          alt="MIPS Payment"
          className="w-24 h-24 rounded-lg object-contain"
          onError={(e) => {
            console.error("Erreur chargement logo");
            e.currentTarget.style.display = "none";
          }}
        />
        <p className="font-semibold text-sm">MiPS Payment</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {menu.map((section, index) => (
          <div key={index}>
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href;

                return (
                  <a
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                      isActive
                        ? "bg-orange-100 text-orange-600"
                        : "hover:bg-gray-100 text-gray-700",
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t p-4">
        {loading ? (
          <div className="text-xs text-gray-400 text-center">Chargement...</div>
        ) : user ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col items-center justify-center">
              <div className="text-sm font-semibold">
                {user.name || user.first_name || "Utilisateur"}
              </div>
              <div className="text-xs text-gray-500">{user.email}</div>
            </div>
            <button
              onClick={logout}
              className="mt-2 text-xs px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition"
            >
              Déconnexion
            </button>
          </div>
        ) : (
          <div className="text-xs text-gray-400 text-center">Non connecté</div>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <>
      <aside className="hidden md:flex w-64 h-full bg-white border-r">
        <SidebarContent />
      </aside>
      <div className="md:hidden p-4 h-[50px]">
        <Sheet>
          <SheetTrigger>
            <Menu className="w-6 h-6 text-gray-600" />
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
