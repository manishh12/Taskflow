import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./ui/AppLayout";
import { LoginPage } from "./views/LoginPage";
import { RegisterPage } from "./views/RegisterPage";
import { ProjectsPage } from "./views/ProjectsPage";
import { ProjectDetailPage } from "./views/ProjectDetailPage";
import { RequireAuth } from "./state/auth";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/:id", element: <ProjectDetailPage /> }
    ]
  }
]);

