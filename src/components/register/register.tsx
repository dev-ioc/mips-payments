"use client";

import { useForm, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "../ui/button";
import toast, { Toaster } from "react-hot-toast";
import { useState } from "react";
import { Loader2 } from "lucide-react";

const BACKEND = "https://mips-wix-backend.onrender.com";
const schema = z.object({
  name: z.string().min(2, "Nom requis"),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Minimum 6 caractères"),
});

type FormData = z.infer<typeof schema>;

const Register = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });
  const onSubmit = async (data: FormData) => {
    setIsSaving(true);
    try {
      const userRes = await fetch(`${BACKEND}/api/user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
        }),
      });
      if (!userRes.ok) {
        const errorData = await userRes.json();
        toast.error("Erreur création utilisateur : " + errorData.error);
        return;
      }
      toast.success("Compte créé avec succès !");
    } catch (err) {
      console.error(err);
      alert("Erreur serveur");
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-100 p-4">
      {isSaving && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
      )}
      <Toaster position="top-right" reverseOrder={false} />
      <div className="w-full max-w-5xl flex rounded-3xl overflow-hidden shadow-2xl shadow-black/20 bg-white min-h-[600px]">
        <div className="relative hidden md:flex md:w-[42%] flex-col justify-between p-10 overflow-hidden bg-primary">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full bg-blue-400/40 blur-[80px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-300/30 blur-[90px]" />
            <div className="absolute top-[40%] left-[30%] w-[50%] h-[50%] rounded-full bg-cyan-400/20 blur-[70px]" />
          </div>
          <div className="relative">
            <div className="w-300 h-200 flex items-center justify-left">
              <img
                src="/mips-logo.png"
                alt="MIPS Payment"
                className="w-400 h-500 object-contain"
              />
            </div>
          </div>
          <div className="relative space-y-4">
            <h1 className="text-3xl font-extrabold text-white leading-tight">
              Configurez votre
              <br />
              espace marchand
              <br />
              en quelques minutes
            </h1>
            <p className="text-sm text-white/60 leading-relaxed max-w-[260px]">
              Renseignez vos credentials MiPS dans les formulaires à droite.
            </p>
          </div>
          <div className="relative">
            <p className="text-xs text-white/40 mb-3 tracking-widest uppercase">
              Nos partenaires
            </p>
            <div className="flex items-center gap-5 text-white/50 text-xs font-semibold">
              <img
                src="assets/logo-mcb-rjwi3kghnbc4xq1zmml1a0w2iubd3e76bcak6tnsio.png"
                alt="MCB"
                className="w-12 h-8"
              />
              <img
                src="assets/logo-visa-rjwi5ahu6dp27zjvkdeeul8hq9tl7f1gjvclv33t40.jpg"
                alt="Visa"
                className="w-12 h-8"
              />
              <img
                src="assets/PayPal-rjwuk340bnrykgx6ftowvwbhks3p8ab7eompt4qgw0.png"
                alt="PayPal"
                className="w-12 h-8"
              />
              <img
                src="assets/Bank-One-logo.jpg"
                alt="Bank One"
                className="w-12 h-8"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center px-8 py-10 md:px-12 overflow-y-auto">
          <div className="max-w-sm w-full mx-auto">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">
              Créer un compte
            </h2>
            <p className="text-sm text-slate-400 mb-7">
              Déjà inscrit ?{" "}
              <a href="/" className="text-blue-600 font-semibold">
                Se connecter
              </a>
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <SectionLabel>Informations du compte</SectionLabel>
              <InputField
                placeholder="Nom complet"
                register={register}
                name="name"
                errors={errors}
              />
              <InputField
                placeholder="Adresse email"
                register={register}
                name="email"
                errors={errors}
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Mot de passe"
                  {...register("password")}
                  className="
        w-full rounded-xl border border-slate-200 bg-slate-50
        px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400
        focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none
        transition-all duration-200 
      "
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-4 h-4 "
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
              <Button
                type="submit"
                className="w-full mt-2 bg-success hover:bg-secondary text-white font-semibold py-2.5 rounded-xl transition-all duration-200 shadow-md shadow-blue-500/25"
              >
                Créer mon compte
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-xs font-semibold text-slate-400 uppercase tracking-widest ${className}`}
    >
      {children}
    </p>
  );
}

type InputFieldProps = {
  placeholder: string;
  name: keyof FormData;
  register: UseFormRegister<FormData>;
  errors: Partial<Record<keyof FormData, any>>;
  type?: string;
};

const InputField = ({
  placeholder,
  register,
  name,
  errors,
  type = "text",
}: InputFieldProps) => (
  <div className="flex flex-col gap-0.5">
    <input
      type={type}
      placeholder={placeholder}
      {...register(name)}
      className="
        w-full rounded-xl border border-slate-200 bg-slate-50
        px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400
        focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none
        transition-all duration-200
      "
    />
    {errors[name] && (
      <p className="text-xs text-red-500 pl-1">{errors[name]?.message}</p>
    )}
  </div>
);

export default Register;
