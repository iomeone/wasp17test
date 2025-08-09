 



1, w a s d 
2, cache
3，input for lat logi





npm install -D shadcn

npm install -D tailwindcss@3.2.7


npm install -D @tailwindcss/forms



npm install -D @tailwindcss/typography


./src/Main.css
@tailwind base;
@tailwind components;
@tailwind utilities;





./postcss.config.cjs
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}





./tailwind.config.cjs
const { resolveProjectPath } = require("wasp/dev");
const { heroui } = require("@heroui/react");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    resolveProjectPath("./src/**/*.{js,jsx,ts,tsx}"),
    resolveProjectPath(
      "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}"
    ),
  ],
  theme: {
    extend: {},
  },
  darkMode: "class",
  plugins: [heroui()],
};






2. Temporarily set up the @ alias (which we'll remove later)
We need to temporarily setup the @ alias to pass the ShadCN preflight checks.

Adjust the tsconfig.json:

// =============================== IMPORTANT =================================
//
// This file is only used for Wasp IDE support. You can change it to configure
// your IDE checks, but none of these options will affect the TypeScript
// compiler. Proper TS compiler configuration in Wasp is coming soon :)
{
  "compilerOptions": {
    // ...
+   "baseUrl": ".",
+   "paths": {
+     "@/*": ["./src/*"]
+   }
  }
}





npx shadcn@latest init


4. Remove the @ alias
Adjust the tsconfig.json:

// =============================== IMPORTANT =================================
//
// This file is only used for Wasp IDE support. You can change it to configure
// your IDE checks, but none of these options will affect the TypeScript
// compiler. Proper TS compiler configuration in Wasp is coming soon :)
{
  "compilerOptions": {
    // ...
-   "baseUrl": ".",
-   "paths": {
-     "@/*": ["./src/*"]
-   }
  }
}





5. Adjust the components.json
Adjust the aliases in components.json to be:

{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.cjs",
    "css": "src/Main.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
-   "components": "@/components",
+   "components": "src/components",
-   "utils": "@/lib/utils",
+   "utils": "../../lib/utils",
-   "ui": "@/components/ui",
+   "ui": "src/components/ui",
-   "lib": "@/lib",
+   "lib": "src/lib",
-   "hooks": "@/hooks"
+   "hooks": "src/hooks"
  }
}


6. Let's add a new component
We'll add a button component with:

npx shadcn@latest add button




7. Adjust the utils import in button.tsx (for each component you add)
You'll notice that you now have a brand new button.tsx file in src/components/ui. We need to fix some import issues:

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

-import { cn } from "s/lib/utils"
+import { cn } from "../../lib/utils"
8. Use the Button component
Now you are ready to use the Button component. That's it!

import './Main.css'

import { Button } from './components/ui/button'

export const MainPage = () => {
  return (
    <div className="container">
      <Button>This works</Button>
    </div>
  )
}




