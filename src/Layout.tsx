
import {
  HeroUIProvider,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  Link,
  Button,
} from "@heroui/react";
import { Outlet } from "react-router-dom";
import "./Main.css";

export function Layout() {
 

  const loginButton = (
    <Button as={Link} color="primary" href={"#"} variant="flat">
      Login with Google
    </Button>
  );

  const logoutButton = (
    <Button color="danger" variant="flat" >
      Logout
    </Button>
  );

  return (
    <HeroUIProvider>
      <div className="text-foreground bg-background min-h-screen">
        <Navbar>
          <NavbarBrand>
            <p className="font-bold text-inherit">11Ask The Documents</p>
          </NavbarBrand>
          <NavbarContent justify="end">
            <NavbarItem>{ logoutButton}</NavbarItem>
          </NavbarContent>
        </Navbar>
        <Outlet />
      </div>
    </HeroUIProvider>
  );
}
