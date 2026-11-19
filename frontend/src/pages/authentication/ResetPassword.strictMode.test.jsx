import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ResetPassword from "./ResetPassword";

const RESET_TOKEN = "0123456789abcdef".repeat(4);
const NEW_PASSWORD = "Abcdef1!";

function renderReset() {
  return render(
    <StrictMode>
      <MemoryRouter>
        <ResetPassword />
      </MemoryRouter>
    </StrictMode>
  );
}

describe("ResetPassword Strict Mode token capture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/reset-password");
  });

  it("keeps the form after Strict Mode strips the fragment and does not treat 429 as an invalid link", async () => {
    window.history.replaceState(null, "", `/reset-password#${RESET_TOKEN}`);

    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        calls.push({
          url: _url,
          method: init?.method,
          body: JSON.parse(init.body),
        });
        return {
          ok: false,
          status: 429,
          json: async () => ({
            message: "Too many requests. Please try again later.",
          }),
        };
      })
    );

    renderReset();

    expect(
      screen.queryByText("This reset link is invalid or incomplete.")
    ).toBeNull();
    expect(screen.getByPlaceholderText("New Password *")).toBeTruthy();
    expect(screen.getByPlaceholderText("Confirm Password *")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update Password" })).toBeTruthy();
    expect(window.location.hash).toBe("");

    fireEvent.change(screen.getByPlaceholderText("New Password *"), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password *"), {
      target: { value: NEW_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });

    expect(String(calls[0].url)).toMatch(/\/auth\/password-reset\/confirm$/);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({
      token: RESET_TOKEN,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    expect(
      screen.queryByText("This reset link is invalid or incomplete.")
    ).toBeNull();
    expect(
      screen.queryByText("This reset link is invalid or expired.")
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Return to Login" })).toBeNull();
    expect(screen.getByPlaceholderText("New Password *")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(
      /Too many requests\. Please try again later\./
    );
  });
});
