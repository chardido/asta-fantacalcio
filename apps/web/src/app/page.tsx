import { Anchor, Button, Container, Group, Stack, Text, Title } from "@mantine/core";

export default function HomePage() {
  return (
    <Container component="main" size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1}>Asta Fantacalcio Companion</Title>
        <Text c="dimmed">
          Accedi per riprendere le tue aste oppure crea un account per iniziare.
        </Text>
        <Group>
          <Button component="a" href="/accedi">
            Accedi
          </Button>
          <Anchor href="/registrati">Registrati</Anchor>
        </Group>
      </Stack>
    </Container>
  );
}
