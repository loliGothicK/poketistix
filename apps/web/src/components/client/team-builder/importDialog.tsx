import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
} from "@mui/material";
import { importSets, extractPokepasteId } from "@/lib/pokepaste";
import { Diagnostics } from "@/components/client/team-builder/index";
import { Team } from "@/store/team/team";
import { isLeft } from "fp-ts/lib/Either";
import { anyhow } from "@/errors/anyhow/error";
import { match } from "ts-pattern";
import { useTranslation } from "react-i18next";
import {
  fetchPokepasteFromUrl,
  PokepasteNotFoundError,
  PokepasteInvalidUrlError,
} from "@services/teams";

interface Props {
  readonly type: "paste" | "url";
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onImport: (team: { readonly members: Team["members"] }) => void;
  readonly onError: (diagnostics: Diagnostics) => void;
}

export default function ImportPokepasteDialog({ type, open, onClose, onImport, onError }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImport = async (): Promise<boolean> => {
    let paste: string;
    if (type === "url") {
      setLoading(true);
      try {
        paste = await fetchPokepasteFromUrl(text);
      } catch (err) {
        if (err instanceof PokepasteNotFoundError) {
          onError({
            severity: "error",
            message: [anyhow(t("teamBuilder.importDialog.notFound"))],
          });
        } else if (err instanceof PokepasteInvalidUrlError) {
          onError({
            severity: "error",
            message: [anyhow(t("teamBuilder.importDialog.invalidUrl"))],
          });
        } else {
          onError({
            severity: "error",
            message: [anyhow(t("teamBuilder.importDialog.fetchFailed"))],
          });
        }
        return false;
      } finally {
        setLoading(false);
      }
    } else {
      paste = text.trim();
    }

    const members = importSets(paste);

    if (isLeft(members) || members.right.members.length === 0) {
      onError({
        severity: "error",
        message: isLeft(members)
          ? members.left
          : [anyhow(t("teamBuilder.importDialog.emptyInput"))],
      });
      return false;
    }

    onImport(members.right);
    setText("");
    return true;
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("teamBuilder.importDialog.title")}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t("teamBuilder.importDialog.instruction")}
          </Typography>

          {match(type)
            .with("paste", () => (
              <TextField
                multiline
                rows={10}
                fullWidth
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoFocus
                sx={{
                  fontFamily: "monospace",
                  "& .MuiInputBase-input": { fontSize: "0.875rem" },
                }}
              />
            ))
            .with("url", () => (
              <TextField
                value={text}
                onChange={(e) => {
                  const val = e.target.value;
                  const id = extractPokepasteId(val);
                  if (id && (val.includes("pokepast.es") || val.includes("/raw"))) {
                    setText(id);
                  } else {
                    setText(val);
                  }
                }}
                autoFocus
                placeholder={t("teamBuilder.importDialog.urlPlaceholder")}
                sx={{
                  fontFamily: "monospace",
                  "& .MuiInputBase-input": { fontSize: "0.875rem" },
                }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <Typography variant="body2" color="text.secondary">
                        {"https://pokepast.es/"}
                      </Typography>
                    ),
                    endAdornment: (
                      <Typography variant="body2" color="text.secondary">
                        {"/raw"}
                      </Typography>
                    ),
                  },
                }}
              />
            ))
            .exhaustive()}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} color="inherit" disabled={loading}>
          {t("teamBuilder.importDialog.cancel")}
        </Button>
        <Button
          onClick={async () => {
            const success = await handleImport();
            if (success) {
              onClose();
            }
          }}
          variant="contained"
          disableElevation
          disabled={loading || !text.trim()}
        >
          {loading
            ? t("teamBuilder.importDialog.loading")
            : `${t("teamBuilder.importDialog.import")} (${
                text.trim()
                  ? t("teamBuilder.importDialog.executing")
                  : t("teamBuilder.importDialog.waiting")
              })`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
