"use client";

import { registrazioneSchema, type InputRegistrazione } from "@asta/contracts";
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

export default function PaginaRegistrazione() {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [invioInCorso, setInvioInCorso] = useState(false);
  const form = useForm<InputRegistrazione>({
    initialValues: { email: "", password: "" },
    validate: creaValidatoreZod(registrazioneSchema),
  });

  async function registrati(valori: InputRegistrazione): Promise<void> {
    setInvioInCorso(true);
    setErrore(null);
    try {
      await inviaCredenziali("/api/autenticazione/registrazione", valori);
      router.replace("/sessioni");
      router.refresh();
    } catch (error_: unknown) {
      if (error_ instanceof ErroreAutenticazioneClient) {
        if (error_.dettagli.campo === "email") {
          form.setFieldError("email", error_.dettagli.vincolo ?? error_.message);
        }
        if (error_.dettagli.campo === "password") {
          form.setFieldError(
            "password",
            error_.dettagli.vincolo ?? error_.message,
          );
        }
        setErrore(error_.message);
      } else {
        setErrore("Non è stato possibile completare la registrazione. Riprova.");
      }
    } finally {
      setInvioInCorso(false);
    }
  }

  return (
    <Container className="nocturne-auth-shell" component="main" size={460}>
      <Stack gap="lg">
        <Title order={1}>Crea il tuo account</Title>
        <Text c="dimmed">
          Le tue aste resteranno private e associate al tuo account.
        </Text>
        <Paper withBorder p="xl" radius="md">
          <form onSubmit={form.onSubmit(registrati)} noValidate>
            <Stack>
              {errore === null ? null : (
                <Alert color="red" title="Registrazione non riuscita">
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
                autoComplete="new-password"
                description="Da 8 a 128 caratteri"
                label="Password"
                required
                {...form.getInputProps("password")}
              />
              <Button loading={invioInCorso} type="submit">
                Registrati
              </Button>
            </Stack>
          </form>
        </Paper>
        <Text ta="center">
          Hai già un account?{" "}
          <Anchor component={Link} href="/accedi">
            Accedi
          </Anchor>
        </Text>
      </Stack>
    </Container>
  );
}
