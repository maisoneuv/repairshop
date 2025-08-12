import {useContext, useState} from "react";
import {
    Box,
    Button,
    Input,
    FormControl,
    FormLabel,
    FormErrorMessage,
    Heading,
    VStack,
    Alert,
    AlertTitle,
    AlertDescription, useToast,
} from "@chakra-ui/react";
import apiClient from "../api/apiClient"; // your preconfigured Axios instance
import { useNavigate } from "react-router-dom";
import { useUser} from "../context/UserContext";


export default function LoginForm() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [formError, setFormError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { login } = useUser();
    const toast = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError("");

        try {
            await login(username, password);      // call context method
            toast({
                title: "Login successful.",
                status: "success",
                duration: 3000,
                isClosable: true,
            });
            navigate("/");                        // redirect to homepage
        } catch (err) {
            setFormError("Invalid credentials or server error.");
        }
    };

    return (
        <Box maxW="md" mx="auto" mt={20} p={8} borderWidth={1} borderRadius="lg" shadow="md">
            <Heading mb={6}>Login</Heading>

            {formError && (
                <Alert status="error" mb={4} borderRadius="md">
                    <Box>
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{formError}</AlertDescription>
                    </Box>
                </Alert>
            )}

            <form onSubmit={handleSubmit}>
                <VStack spacing={4}>
                    <FormControl isRequired>
                        <FormLabel>Username</FormLabel>
                        <Input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </FormControl>

                    <FormControl isRequired>
                        <FormLabel>Password</FormLabel>
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </FormControl>

                    <Button type="submit" colorScheme="blue" width="full">
                        Login
                    </Button>
                </VStack>
            </form>
        </Box>
    );
}
