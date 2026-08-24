"use client";

import { accessoSchema, type InputAccesso } from "@asta/contracts";
import {
  Alert,
  Anchor,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  ErroreAutenticazioneClient,
  inviaCredenziali,
} from "@/client/autenticazione-client";
import { creaValidatoreZod } from "@/client/validazione-zod";

export default function PaginaAccesso() {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [invioInCorso, setInvioInCorso] = useState(false);
  const form = useForm<InputAccesso>({
    initialValues: { email: "", password: "" },
    validate: creaValidatoreZod(accessoSchema),
  });

  async function accedi(valori: InputAccesso): Promise<void> {
    setInvioInCorso(true);
    setErrore(null);
    try {
      await inviaCredenziali("/api/autenticazione/accesso", valori);
      router.replace("/sessioni");
      router.refresh();
    } catch (error_: unknown) {
      const messaggio =
        error_ instanceof ErroreAutenticazioneClient
          ? error_.message
          : "Non è stato possibile accedere. Riprova.";
      setErrore(messaggio);
    } finally {
      setInvioInCorso(false);
    }
  }

  return (
    <Container component="main" size={460} py="xl">
      <Stack gap="lg">
        <Title order={1}>Accedi</Title>
        <Text c="dimmed">
          Entra per visualizzare esclusivamente le tue sessioni d&apos;asta.
        </Text>
        <Paper withBorder p="xl" radius="md">
          <form onSubmit={form.onSubmit(accedi)} noValidate>
            <Stack>
              {errore === null ? null : (
                <Alert color="red" title="Accesso non riuscito">
                  {errore}
                </Alert>
              )}
              <TextInput
                autoComplete="email"
                label="Email"
                placeholder="allenatore@example.com"
                required
                type="email"
                {...form.getInputProps("email")}
              />
              <PasswordInput
                autoComplete="current-password"
                label="Password"
                required
                {...form.getInputProps("password")}
              />
              <Button loading={invioInCorso} type="submit">
                Accedi
              </Button>
            </Stack>
          </form>
        </Paper>
        <Text ta="center">
          Non hai un account?{" "}
          <Anchor component={Link} href="/registrati">
            Registrati
          </Anchor>
        </Text>
      </Stack>
    </Container>
  );
}
