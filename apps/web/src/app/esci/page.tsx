"use client";

import { Alert, Button, Container, Paper, Stack, Text, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { inviaUscita } from "@/client/autenticazione-client";

export default function PaginaUscita() {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [invioInCorso, setInvioInCorso] = useState(false);

  async function esci(): Promise<void> {
    setInvioInCorso(true);
    setErrore(null);
    try {
      await inviaUscita();
      router.replace("/accedi");
      router.refresh();
    } catch (error_: unknown) {
      setErrore(
        error_ instanceof Error
          ? error_.message
          : "Non è stato possibile completare l'uscita. Riprova.",
      );
    } finally {
      setInvioInCorso(false);
    }
  }

  return (
    <Container component="main" size={460} py="xl">
      <Stack gap="lg">
        <Title order={1}>Esci</Title>
        <Paper withBorder p="xl" radius="md">
          <Stack>
            <Text>
              Conferma per invalidare la sessione corrente su questo dispositivo.
            </Text>
            {errore === null ? null : (
              <Alert color="red" title="Uscita non riuscita">
                {errore}
              </Alert>
            )}
            <Button color="red" loading={invioInCorso} onClick={esci}>
              Esci dall&apos;account
            </Button>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
