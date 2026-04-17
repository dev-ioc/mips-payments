import { extensions } from "@wix/astro/builders";

export default extensions.customElement({
  id: "964a786e-81f2-4376-a053-26af43e6006c",
  name: "MiPS Pay",
  width: {
    defaultWidth: 450,
    allowStretch: true,
  },
  height: {
    defaultHeight: 250,
  },
  installation: {
    autoAdd: true,
  },
  presets: [
    {
      id: "63328fb9-3d8f-4d76-8023-5b286ccfc06e",
      name: "default",
      thumbnailUrl: "{{BASE_URL}}/mips-logo.png",
    },
  ],

  tagName: "mips-pay",
  element: "./extensions/site/widgets/mips-pay/mips-pay.tsx",
  settings: "./extensions/site/widgets/mips-pay/mips-pay.panel.tsx",
});
