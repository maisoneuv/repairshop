import { useContext } from "react";
import { Button } from "@chakra-ui/react";
import { useUser} from "../context/UserContext";

export default function LogoutButton() {
    const { logout } = useUser();

    return (
        <Button colorScheme="blue" variant='outline' size='sm'
                onClick={logout}>
            Logout
        </Button>
    );
}
