// src/components/nextui/sidebarNested/sidebar-items.js
export const sectionNestedItems = [
  {
    key: "general",
    title: "GENERAL",
    items: [
      {
        key: "home",
        title: "Home",
        icon: "solar:home-2-line-duotone",
        href: "/",
      },
      {
        key: "dashboard",
        title: "Dashboard",
        icon: "solar:graph-up-line-duotone",
        href: "/dashboard",
      },
    ],
  },
  {
    key: "management",
    type: "nest",            // 指定嵌套路由
    title: "Management",
    icon: "solar:folder-line-duotone",
    items: [
      {
        key: "users",
        title: "Users",
        icon: "solar:user-circle-line-duotone",
        href: "/users",
      },
      {
        key: "projects",
        title: "Projects",
        icon: "solar:layers-line-duotone",
        href: "/projects",
      },
    ],
  },
];
