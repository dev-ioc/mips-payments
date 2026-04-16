import type { FC } from "react";
import { EmptyState, Page, WixDesignSystemProvider } from "@wix/design-system";
import "@wix/design-system/styles.global.css";
import MipsDashboard from "../../../../components/dashboard";

const DashboardPage: FC = () => {
  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Content>
          <MipsDashboard />
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
