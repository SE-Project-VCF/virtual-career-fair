import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Typography,
    CircularProgress,
    Alert,
    Box,
    List,
    ListItemButton,
    ListItemText,
} from "@mui/material";

import { useState, useEffect } from "react";
import { StreamChat } from "stream-chat";
import type { User } from "../../utils/auth";

interface NewChatDialogProps {
    open: boolean;
    onClose: () => void;
    client: StreamChat;
    currentUser: User | null;
    clientReady: boolean;
    onSelectChannel?: (channel: any) => void;
}

export default function NewChatDialog({
    open,
    onClose,
    client,
    currentUser,
    clientReady,
    onSelectChannel,
}: NewChatDialogProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [selectedUser, setSelectedUser] = useState<any | null>(null);
    const [recipientEmail, setRecipientEmail] = useState("");
    const [searchLoading, setSearchLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");


    /* -------------------------
         USER SEARCH
    -------------------------- */
    useEffect(() => {
        if (!open || !clientReady) return;

        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        const timer = setTimeout(() => {
            runSearch(searchQuery.trim());
        }, 250);

        return () => clearTimeout(timer);
    }, [searchQuery, open, clientReady]);

    const runSearch = async (text: string) => {
        if (!clientReady || !currentUser) return;

        try {
            setSearchLoading(true);

            const filter: any = {
                id: { $ne: currentUser.uid },
                $or: [
                    { name: { $autocomplete: text } },
                    { username: { $autocomplete: text } },
                    { email: { $eq: text } },
                ],
            };

            const res = await client.queryUsers(filter, { name: 1 }, { limit: 10 });

            setResults(res.users || []);
        } catch (err) {
            console.error("Stream user search failed:", err);
            setResults([]);
        }

        setSearchLoading(false);
    };

    /* -------------------------
         CREATE / FETCH DM
    -------------------------- */
    const handleCreateChat = async () => {
        setError("");
        setSuccess("");

        if (!selectedUser) {
            setError("Please select a user.");
            return;
        }
        if (!currentUser) {
            setError("You must be logged in.");
            return;
        }

        setLoading(true);

        try {
            // Sorted IDs for stable DM channel name
            const sorted = [currentUser.uid, selectedUser.id].sort();
            const channelId = `dm-${sorted[0]}-${sorted[1]}`;

            // 1. Check if channel already exists
            const existing = await client.queryChannels(
                {
                    type: "messaging",
                    cid: `messaging:${channelId}`,
                },
                {},
                { limit: 1 }
            );

            let channel;

            if (existing.length > 0) {
                channel = existing[0];
                await channel.watch();
            } else {
                // 2. Create new DM
                channel = client.channel("messaging", channelId, {
                    members: sorted,
                });

                await channel.create();
                await channel.watch();
            }

            // 🚀 NEW: Immediately open the channel in ChatPage
            if (onSelectChannel) {
                onSelectChannel(channel);
            }

            // Close dialog right away
            onClose();
        } catch (err) {
            console.error("Error creating chat:", err);
            setError("Failed to create chat.");
        }

        setLoading(false);
    };


    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Start a New Chat</DialogTitle>

            <DialogContent>
                <Typography sx={{ mb: 2 }}>
                    Search for another user to start a private chat.
                </Typography>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                {/* SEARCH BAR */}
                <TextField
                    fullWidth
                    label="Search users..."
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setSelectedUser(null);
                    }}
                    sx={{ mb: 2 }}
                />

                {searchLoading && (
                    <Box sx={{ textAlign: "center", mb: 1 }}>
                        <CircularProgress size={20} />
                    </Box>
                )}

                {/* SEARCH RESULTS */}
                <List sx={{ maxHeight: 220, overflowY: "auto" }}>
                    {results.map((u) => (
                        <ListItemButton
                            key={u.id}
                            onClick={() => {
                                setSelectedUser(u);
                                setRecipientEmail(u.email);
                                setSearchQuery(u.name || u.email);
                                setResults([]);
                            }}
                        >
                            <ListItemText
                                primary={u.name || u.email}
                                secondary={u.email}
                            />
                        </ListItemButton>
                    ))}
                </List>

                {/* CONFIRM EMAIL */}
                <TextField
                    fullWidth
                    label="Recipient Email"
                    value={recipientEmail}
                    disabled
                    sx={{ mt: 2 }}
                />

                {loading && (
                    <Box sx={{ textAlign: "center", mt: 3 }}>
                        <CircularProgress size={24} />
                    </Box>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} disabled={loading}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleCreateChat}
                    disabled={!selectedUser || loading}
                >
                    {loading ? "Creating..." : "Start Chat"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
