import type { FC } from "react";
import { Page, WixDesignSystemProvider } from "@wix/design-system";
import "../../../../styles/globals.css";
import Login from "@/components/login";

const LoginPage: FC = () => {
  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page.Content>
        <div className="h-screen flex items-center justify-center w-full">
          <Login />
        </div>
      </Page.Content>
    </WixDesignSystemProvider>
  );
};

export default LoginPage;
