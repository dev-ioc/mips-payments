import type { FC } from "react";
import { Page, WixDesignSystemProvider } from "@wix/design-system";
import "../../../../styles/globals.css";
import MipsDashboard from "../../../../components/dashboard";
import DashboardLayout from "@/layouts/Layout";

const DashboardPage: FC = () => {
  return (
    <DashboardLayout>
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Page>
          <Page.Content>
            <div className="h-screen w-full">
              <MipsDashboard />
            </div>
          </Page.Content>
        </Page>
      </WixDesignSystemProvider>
    </DashboardLayout>
  );
};

export default DashboardPage;
