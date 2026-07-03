import App from "./App.svelte";
import "./app.css";
import { mount } from "svelte";

const target = document.getElementById("app") as HTMLElement;
target.replaceChildren();

const app = mount(App, {
  target
});

export default app;
