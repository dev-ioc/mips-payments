import type { FC } from "react";
import { Page, WixDesignSystemProvider } from "@wix/design-system";
import "@/styles/globals.css";
import MipsCredentials from "@/components/credentials/credential";
import DashboardLayout from "@/layouts/Layout";

const CredentialsPage: FC = () => {
  return (
    <DashboardLayout>
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Page>
          <Page.Content>
            <div className="h-screen flex items-center justify-center w-full h-full">
              <MipsCredentials />
            </div>
          </Page.Content>
        </Page>
      </WixDesignSystemProvider>
    </DashboardLayout>
  );
};

export default CredentialsPage;
