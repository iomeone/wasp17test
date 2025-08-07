import { useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Tabs,
  Tab,
  Avatar,
  Button,
  ScrollShadow,
  Spacer,
} from "@heroui/react";
import {
  FaBars,
  FaBell,
  FaUserCircle,
  FaCog,
  FaHome,
  FaPoll,
  FaRegEnvelope,
  FaRegFileAlt,
  FaSearch,
} from "react-icons/fa";

export function Main() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const menuItems = [
    { icon: FaHome, title: "Home" },
    { icon: FaRegFileAlt, title: "Blogs" },
    { icon: FaPoll, title: "Reports" },
    { icon: FaRegEnvelope, title: "Inbox" },
    { icon: FaCog, title: "Settings" },
  ];

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <div className={`\n        ${sidebarCollapsed ? "w-16" : "w-72"} \n        bg-default-100 border-r border-divider \n        flex flex-col transition-width duration-200`}>

        {/* Header & Toggle */}
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-foreground flex items-center justify-center">
              <FaHome className="text-background" />
            </div>
            {!sidebarCollapsed && (
              <span className="text-small font-bold uppercase text-default-600">
                Admin
              </span>
            )}
          </div>
          <FaBars
            className="text-default-500 cursor-pointer"
            onClick={() => setSidebarCollapsed((v) => !v)}
          />
        </div>

        <Spacer y={4} />

        {/* Menu List */}
        <ScrollShadow className="overflow-y-auto flex-1 -mr-6 py-6 pr-6">
          <ul className="space-y-2">
            {menuItems.map(({ icon: IconComp, title }) => (
              <li key={title}>
                <a
                  href="#"
                  className="flex items-center gap-3 px-3 py-2 rounded-2xl text-default-500 hover:text-foreground hover:bg-default-200"
                >
                  <IconComp className="w-6 h-6" />
                  {!sidebarCollapsed && title}
                </a>
              </li>
            ))}
          </ul>
        </ScrollShadow>

        <Spacer y={4} />

        {/* Bottom Buttons */}
        <div className="p-6">
          {!sidebarCollapsed && (
            <>
              <Button fullWidth variant="light" className="justify-start mb-2">
                Help & Information
              </Button>
              <Button fullWidth variant="light" className="justify-start">
                Log Out
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Navbar */}
        <nav className="bg-gray-800 px-6 py-3 flex justify-between">
          <div className="flex items-center text-xl">
            <FaBars
              className="text-white mr-4 cursor-pointer"
              onClick={() => setSidebarCollapsed((v) => !v)}
            />
            <span className="text-white font-semibold">E-commerce</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative w-64">
              <div className="absolute inset-y-0 left-0 flex items-center pl-2">
                <button className="p-1 focus:outline-none text-white">
                  <FaSearch />
                </button>
              </div>
              <input
                type="text"
                placeholder="Search"
                className="w-full px-4 py-1 pl-12 rounded shadow outline-none hidden md:block"
              />
            </div>
            <FaBell className="text-white w-6 h-6" />
            <div className="relative group">
              <FaUserCircle className="text-white w-6 h-6 cursor-pointer" />
              <div className="hidden group-hover:block absolute right-0 mt-2 w-32 bg-white rounded-lg shadow">
                <ul className="py-2 text-sm text-gray-950">
                  <li>
                    <a href="#" className="block px-4 py-2 hover:bg-default-200">
                      Profile
                    </a>
                  </li>
                  <li>
                    <a href="#" className="block px-4 py-2 hover:bg-default-200">
                      Settings
                    </a>
                  </li>
                  <li>
                    <a href="#" className="block px-4 py-2 hover:bg-default-200">
                      Log Out
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </nav>

        {/* Content Area */}
        <div className="p-6 overflow-auto">
          <Tabs aria-label="Options" variant="bordered" color="primary">
            <Tab key="ask" title="Ask"></Tab>
            <Tab key="add" title="Add Document"></Tab>
          </Tabs>
          <Card className="mt-6">
            <CardHeader>Let's embed with Wasp</CardHeader>
            <CardBody>...</CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
