import { app } from "@wix/astro/builders";
import myPage from "./extensions/dashboard/pages/dashboard-page/dashboard-page.extension.ts";

import mipsButtonWidget from './extensions/site/widgets/mips-button-widget/mips-button-widget.extension.ts';

export default app().use(myPage).use(mipsButtonWidget);
