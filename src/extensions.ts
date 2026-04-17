import { app } from "@wix/astro/builders";
import myPage from "./extensions/dashboard/pages/dashboard-page/dashboard-page.extension.ts";

// import mipsButtonWidget from './extensions/site/widgets/mips-button-widget/mips-button-widget.extension.ts';

import login from "./extensions/dashboard/pages/login/login.extension.ts";

import register from "./extensions/dashboard/pages/register/register.extension.ts";

import mipsPay from './extensions/site/widgets/mips-pay/mips-pay.extension.ts';

import credentialsPage from './extensions/dashboard/pages/credentials-page/credentials-page.extension.ts';

export default app().use(myPage).use(login).use(register).use(mipsPay).use(credentialsPage);
