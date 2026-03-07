import { RouterProvider } from "react-router";
import { router } from "./routes";

/** AOA Flashcard App — main entry point */
export default function App() {
  return <RouterProvider router={router} />;
}
