import type { FC, ReactNode } from "react";
import { Page, WixDesignSystemProvider } from "@wix/design-system";
import "../styles/globals.css";
import { Sidebar } from "@/components/sidebar/sidebar";

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout: FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <WixDesignSystemProvider>
      <Page.Content>
        <div className="flex h-screen">
          <Sidebar />
          <main className="overflow-auto w-full">{children}</main>
        </div>
      </Page.Content>
    </WixDesignSystemProvider>
  );
};

export default DashboardLayout;
