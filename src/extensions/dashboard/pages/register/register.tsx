import type { FC } from "react";
import { Page, WixDesignSystemProvider } from "@wix/design-system";
import "../../../../styles/globals.css";
import Register from "@/components/register/register";
import DashboardLayout from "@/layouts/Layout";

const RegisterPage: FC = () => {
  return (
    <DashboardLayout>
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Page.Content>
          <div className="h-screen flex items-center justify-center w-full">
            <Register />
          </div>
        </Page.Content>
      </WixDesignSystemProvider>
    </DashboardLayout>
  );
};

export default RegisterPage;
