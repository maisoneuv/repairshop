import React from "react";
import LoginForm from "../pages/LoginForm";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
    const navigate = useNavigate();

    return (
        <LoginForm onSuccess={() => navigate("/")} />
    );
}
