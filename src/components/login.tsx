"use client";

import { useForm } from "react-hook-form";
import * as z from "zod";
import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "./ui/button";

// Utilisez la même URL que votre backend MiPS
const BACKEND = "https://0464-102-18-5-16.ngrok-free.app";

const schema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Minimum 6 caractères"),
});

type FormData = z.infer<typeof schema>;

const Login = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const onSubmit = async (formData: FormData) => {
    setIsSaving(true);
    try {
      setErrorMsg("");

      console.log("Tentative de connexion à:", `${BACKEND}/api/login`);

      const res = await fetch(`${BACKEND}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      const result = await res.json();
      console.log("Réponse:", result);

      if (res.status === 404) {
        toast.error("Utilisateur introuvable");
        return;
      }
      if (res.status === 401) {
        toast.error("Mot de passe incorrect");
        return;
      }
      if (!res.ok) {
        setErrorMsg(result.error || "Erreur de connexion");
        return;
      }
      if (result.token) {
        localStorage.setItem("token", result.token);
      }
      window.location.href = "/credentialls-page";
    } catch (error) {
      console.error("Erreur de connexion:", error);
      setErrorMsg("Erreur serveur - Vérifiez que le backend est accessible");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex relative">
      {isSaving && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
      )}
      <Toaster position="top-right" reverseOrder={false} />
      <div className="relative hidden lg:flex lg:w-[48%] flex-col justify-between p-12 overflow-hidden bg-primary">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {[320, 420, 520, 620, 720].map((size, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-white/10"
              style={{ width: size, height: size }}
            />
          ))}
        </div>
        <div className="relative">
          <div className="w-300 h-200 flex items-center justify-left">
            <img
              src="assets/mips-logo.png"
              alt="MIPS Payment"
              className="w-400 h-500 object-contain"
            />
          </div>
        </div>
        <div className="relative space-y-6">
          <h1 className="text-5xl font-black text-white leading-tight tracking-tight">
            Bonjour,
            <br />
            Bienvenue !
          </h1>
          <p className="text-base text-white/60 leading-relaxed max-w-[320px]">
            Gérez vos paiements MiPS en toute simplicité. Automatisez vos
            transactions et gagnez en productivité.
          </p>
        </div>
        <div className="relative">
          <p className="text-xs text-white/30">
            © 2026 Plateforme MiPS. Tous droits réservés.
          </p>
        </div>
      </div>
      <div className="flex-1 flex flex-col bg-white">
        <div className="flex-1 flex flex-col justify-center px-10 md:px-20 max-w-lg mx-auto w-full pb-10">
          <h2 className="text-3xl font-black text-slate-900 mb-1 tracking-tight">
            Authentification !
          </h2>
          <p className="text-sm text-slate-400 mb-8">
            Pas encore de compte ?{" "}
            <a href="/register" className="text-[#2B2FDE] font-semibold">
              Créer un compte, c'est gratuit.
            </a>
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <input
                placeholder="votre@email.com"
                {...register("email")}
                className="
                  w-full border-0 border-b-2 border-slate-200 bg-transparent rounded-none
                  px-0 py-3 text-sm text-slate-800 placeholder:text-slate-400
                  focus:border-[#2B2FDE] focus:ring-0 focus:outline-none
                  transition-colors duration-200
                "
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Mot de passe"
                {...register("password")}
                className="
                  w-full border-b-2 border-slate-200 bg-transparent
                  px-0 py-3 pr-8 text-sm text-slate-800 placeholder:text-slate-400
                  focus:border-[#2B2FDE] focus:ring-0 focus:outline-none
                  transition-colors duration-200
                "
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L6.59 6.59m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>
            <div className="pt-2 space-y-3">
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-slate-700 text-white font-bold py-3 rounded-lg transition-all duration-200 text-sm"
              >
                Se connecter
              </Button>
            </div>
          </form>
          <div className="mt-5 text-center">
            <span className="text-sm text-slate-400">
              Mot de passe oublié ?{" "}
            </span>
            <button
              type="button"
              className="text-sm text-[#2B2FDE] font-bold hover:underline transition-colors"
            >
              Cliquez ici
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
