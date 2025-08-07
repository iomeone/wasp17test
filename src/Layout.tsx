
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
      <div>
        <Outlet />
      </div>
    </HeroUIProvider>
  );
}
