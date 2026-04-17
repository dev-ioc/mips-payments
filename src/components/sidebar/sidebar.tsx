import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CreditCard, FileText, Key, Bell, Menu, BarChart } from "lucide-react";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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

  const fetchUser = async () => {
    try {
      const token = localStorage.getItem("token");
      console.log(token);
      if (!token) return;

      const res = await fetch(
        "https://valued-extras-adding-mating.trycloudflare.com/api/user",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await res.json();
      setUser(data.user);
    } catch (err) {
      console.error(err);
    }
  };
  const [pathname, setPathname] = useState("/");

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
                        : "hover:bg-gray-100",
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
        {user ? (
          <div className="flex flex-col gap-2 ">
            <div className="flex flex-col items-center justify-center">
              <div className="text-sm font-semibold ">
                {user.name || "Utilisateur"}
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
          <div className="text-xs text-gray-400">Non connecté</div>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 h-full bg-white border-r">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile */}
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
