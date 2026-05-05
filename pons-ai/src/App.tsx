import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  Camera, 
  Video,
  RefreshCw, 
  Image as ImageIcon, 
  Loader2, 
  ChevronRight, 
  ChevronLeft,
  Maximize2,
  X,
  Sparkles,
  Download,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  LogOut,
  UserPlus,
  User as UserIcon,
  ChevronDown,
  Home,
  Layout,
  Layers,
  Cloud,
  History,
  Grid,
  Terminal,
  Target,
  Check,
  Ban,
  Trash2,
  Clock,
  DollarSign,
  Plus,
  Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { generateInfluencerCarousel, GeneratedImage } from "@/src/services/gemini";
import { generateVideo, checkApiKey, openApiKeySelector } from "@/src/services/videoService";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User as FirebaseUser 
} from "firebase/auth";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment
} from "firebase/firestore";
import { auth, db, storage, googleProvider } from "@/src/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

interface TopUpRequest {
  id: string;
  userId: string;
  userEmail: string;
  displayName: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: any;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const LOCATIONS = [
  "Beach", "City Street", "Luxury Hotel", "Rooftop", "Cafe", "Gym", "Tropical Resort", "Indoor Studio",
  "Zen Garden", "Cyberpunk Alley", "Futuristic Lab", "Desert Oasis", "Snowy Cabin", "Library", 
  "Underwater Base", "Mars Colony", "High-Fashion Runway", "Night Market", "Alpine Peak", "Ancient Ruins",
  "Art Gallery", "Basketball Court", "Parisian Balcony", "Neon Tokyo", "Sakura Park", "Industrial Loft"
];

const OUTFITS = [
  "Streetwear", "Elegant Dress", "Sporty Outfit", "Casual Chic", "Influencer Fashion", "Beachwear", "Luxury Outfit",
  "Cyberpunk Techwear", "Victorian Steampunk", "Sci-Fi Suit", "Retro 80s", "Minimalist Linen", "Boho Festival", 
  "Gothic Noir", "Royal Garments", "Future Sport", "Couture Gown", "Rugged Explorer", "Y2K Aesthetic", "Oversized Knit"
];

const compressImage = (base64Str: string, maxWidth = 1024, maxHeight = 1024, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
  });
};

export default function App() {
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [outfit, setOutfit] = useState(OUTFITS[0]);
  const [imageCount, setImageCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  // Top-Up States
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [isTopUpConfirmOpen, setIsTopUpConfirmOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<TopUpRequest[]>([]);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpSuccess, setTopUpSuccess] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'home' | 'studio' | 'gallery' | 'logs' | 'video'>('home');
  const [cloudResults, setCloudResults] = useState<any[]>([]);
  const [galleryItems, setGalleryItems] = useState<any[]>([]);
  const [customLocation, setCustomLocation] = useState("");
  const [customOutfit, setCustomOutfit] = useState("");
  const [promptLog, setPromptLog] = useState<{id: string, timestamp: Date, prompt: string, location: string, outfit: string}[]>([]);
  const [cloudPrompts, setCloudPrompts] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string | number, type: 'local' | 'cloud' | 'clear-all' } | null>(null);
  const [promptDeleteConfirm, setPromptDeleteConfirm] = useState<{ id: string | number, type: 'local' | 'cloud' } | null>(null);
  
  // Video States
  const [videoReferenceImage, setVideoReferenceImage] = useState<string | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  
  const [visibleLocations, setVisibleLocations] = useState<string[]>(LOCATIONS.slice(0, 8));
  const [visibleOutfits, setVisibleOutfits] = useState<string[]>(OUTFITS.slice(0, 8));

  const successAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    successAudio.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3"); // Notification ding
  }, []);

  const activeImageList = activeTab === 'studio' ? results : galleryItems;
  const currentSelectedImage = selectedImage !== null ? activeImageList[selectedImage] : null;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFaceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setVideoReferenceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateVideo = async () => {
    if (!videoReferenceImage) {
      setVideoError("Please upload a reference image for the video.");
      return;
    }

    setVideoError(null);
    setIsGeneratingVideo(true);

    try {
      const hasKey = await checkApiKey();
      if (!hasKey) {
        await openApiKeySelector();
      }

      const result = await generateVideo(videoReferenceImage);
      setGeneratedVideoUrl(result.url);
      speakPrompt("Video generation complete.");

      // Save to cloud gallery if logged in
      if (auth.currentUser) {
        const path = `users/${auth.currentUser.uid}/gallery`;
        try {
          // Upload to Cloud Storage for persistence
          const response = await fetch(result.url);
          const blob = await response.blob();
          const fileName = `users/${auth.currentUser.uid}/videos/${Date.now()}.mp4`;
          const storageRef = ref(storage, fileName);
          await uploadBytes(storageRef, blob);
          const downloadUrl = await getDownloadURL(storageRef);

          await addDoc(collection(db, path), {
            url: downloadUrl,
            type: 'video',
            userId: auth.currentUser.uid,
            prompt: result.prompt,
            timestamp: serverTimestamp(),
          });

          // Also save to prompt logs
          const promptPath = `users/${auth.currentUser.uid}/prompts`;
          await addDoc(collection(db, promptPath), {
            prompt: result.prompt,
            type: 'video',
            timestamp: serverTimestamp(),
            location: 'Motion Atelier',
            outfit: 'Animated Identity'
          });

          // Update UI with persistent URL
          setGeneratedVideoUrl(downloadUrl);
        } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, path);
        }
      }
    } catch (err: any) {
      if (err.message === "API_KEY_EXPIRED") {
        await openApiKeySelector();
        setVideoError("Please select your API key again to continue.");
      } else {
        setVideoError(err.message || "Failed to generate video.");
      }
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const randomizeLocation = () => {
    // Shuffle master list and pick 8 options
    const shuffled = [...LOCATIONS].sort(() => Math.random() - 0.5);
    const subset = shuffled.slice(0, 8);
    // If current isn't in subset, add it or pick new
    setVisibleLocations(subset);
    const random = subset[Math.floor(Math.random() * subset.length)];
    setLocation(random);
  };

  const randomizeOutfit = () => {
    // Shuffle master list and pick 8 options
    const shuffled = [...OUTFITS].sort(() => Math.random() - 0.5);
    const subset = shuffled.slice(0, 8);
    setVisibleOutfits(subset);
    const random = subset[Math.floor(Math.random() * subset.length)];
    setOutfit(random);
  };

  const speakPrompt = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      
      // Attempt to find a female voice by common names or labels
      const femaleVoice = voices.find(v => 
        v.name.toLowerCase().includes('female') || 
        v.name.toLowerCase().includes('assistant') || 
        v.name.includes('Google US English') ||
        v.name.includes('Samantha') ||
        v.name.includes('Microsoft Zira') ||
        v.name.includes('Victoria')
      );
      
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      
      utterance.rate = 1.0;
      utterance.pitch = 1.25; // Increase pitch slightly for a more feminine tone
      window.speechSynthesis.speak(utterance);
    }
  };

  // Admin: Sync Top Up Requests
  useEffect(() => {
    if (user?.email === 'sipapapons@gmail.com') {
      const q = query(collection(db, 'topups'), orderBy('timestamp', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TopUpRequest));
        setPendingRequests(reqs);
      });
      return () => unsubscribe();
    }
  }, [user]);

  const handleGenerate = async () => {
    if (!faceImage) {
      setError("Please upload a face reference image first.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    // Credit check
    const isDeveloper = user?.email === 'sipapapons@gmail.com';
    if (!isDeveloper && user && credits !== null && credits < imageCount * 4) {
      setError("Insufficient credits. Please contact support or the administrator.");
      setIsGenerating(false);
      return;
    }

    speakPrompt("Starting Batch Generation");
    try {
      const finalLoc = customLocation.trim() || location;
      const finalOutfit = customOutfit.trim() || outfit;

      const images = await generateInfluencerCarousel({
        faceImage,
        location: finalLoc,
        outfit: finalOutfit,
        count: imageCount
      });

      if (!images || images.length === 0) {
        throw new Error("Generation complete but no images were returned by the AI. This can happen due to safety filters or occasional model timeouts.");
      }

      setResults(images);
      
      // Deduct credits if user is logged in (Developer has unlimited)
      if (user && !isDeveloper) {
        const userRef = doc(db, 'users', user.uid);
        try {
          await updateDoc(userRef, {
            credits: increment(-(images.length * 4))
          });
        } catch (e) {
          console.error("Failed to deduct credits", e);
        }
      }

      successAudio.current?.play().catch(e => console.log("Audio play failed:", e));

      // Add to prompt logs
      if (images.length > 0) {
        const batchId = Date.now().toString(36);
        const newLogs = images.map((img, i) => ({
          id: `${batchId}-${i}-${Math.random().toString(36).substring(7)}`,
          timestamp: new Date(),
          prompt: img.prompt,
          location: finalLoc,
          outfit: finalOutfit,
          type: 'image' as const
        }));
        
        setPromptLog(prev => [...newLogs, ...prev]);

        // Auto-save prompts to cloud if user is logged in
        if (auth.currentUser) {
          const promptPath = `users/${auth.currentUser.uid}/prompts`;
          // Save prompts in parallel
          const promptTasks = images.map(img => 
            addDoc(collection(db, promptPath), {
              prompt: img.prompt,
              location: finalLoc,
              outfit: finalOutfit,
              timestamp: serverTimestamp(),
              type: 'image'
            }).catch(e => handleFirestoreError(e, OperationType.CREATE, promptPath))
          );
          await Promise.all(promptTasks);
        }
      }

      // Auto-save to cloud if user is logged in
      if (auth.currentUser) {
        const path = `users/${auth.currentUser.uid}/gallery`;
        // Save images to gallery in parallel
        const galleryTasks = images.map(async (img) => {
          try {
            const compressedUrl = await compressImage(img.url);
            await addDoc(collection(db, path), {
              url: compressedUrl,
              type: 'image',
              userId: auth.currentUser!.uid,
              location: finalLoc,
              outfit: finalOutfit,
              prompt: img.prompt,
              timestamp: serverTimestamp(),
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, path);
          }
        });
        await Promise.all(galleryTasks);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate images. Please try again.";
      setError(errorMessage);
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTopUpRequest = async () => {
    if (!user || !topUpAmount || isNaN(Number(topUpAmount))) return;
    
    setTopUpLoading(true);
    try {
      await addDoc(collection(db, 'topups'), {
        userId: user.uid,
        userEmail: user.email,
        displayName: user.displayName || 'Anonymous User',
        amount: Number(topUpAmount),
        status: 'pending',
        timestamp: serverTimestamp()
      });
      setIsTopUpOpen(false);
      setIsTopUpConfirmOpen(false);
      setTopUpAmount("");
      setTopUpSuccess(`Request for ${Number(topUpAmount).toLocaleString()} credits submitted!`);
      speakPrompt("Top up request submitted. Please wait for developer approval.");
    } catch (e) {
      console.error("Top up request failed", e);
      setError("Failed to submit request. Please try again.");
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleApproveTopUp = async (request: TopUpRequest) => {
    try {
      const userRef = doc(db, 'users', request.userId);
      const requestRef = doc(db, 'topups', request.id);
      
      // Update user credits
      await updateDoc(userRef, {
        credits: increment(request.amount)
      });
      
      // Mark request as approved
      await updateDoc(requestRef, {
        status: 'approved'
      });
      speakPrompt(`Approved ${request.amount} credits for ${request.displayName}`);
    } catch (e) {
      console.error("Approval failed", e);
      setError("Failed to approve credits.");
    }
  };

  const handleRejectTopUp = async (requestId: string) => {
    try {
      const requestRef = doc(db, 'topups', requestId);
      await updateDoc(requestRef, {
        status: 'rejected'
      });
      speakPrompt(`Rejected top up request from ${requestId}`);
    } catch (e) {
      console.error("Rejection failed", e);
      setError("Failed to reject request.");
    }
  };

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const userRef = doc(db, 'users', user.uid);
      
      const userSnap = await getDoc(userRef);
      const initialCredits = user.email === 'sipapapons@gmail.com' ? 1000000 : 5000;

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          createdAt: serverTimestamp(),
          credits: initialCredits,
        });
      } else {
        const updateData: any = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        };
        
        // Ensure developer gets the 1M credit top-up
        if (user.email === 'sipapapons@gmail.com') {
          updateData.credits = initialCredits;
        }

        await setDoc(userRef, updateData, { merge: true });
      }

      // After successful login, if there are local session results, sync them to cloud
      if (results.length > 0) {
        setIsSyncing(true);
        const path = `users/${user.uid}/gallery`;
        // Sync session images in parallel
        const syncTasks = results.map(async (img) => {
          try {
            const compressedUrl = await compressImage(img.url);
            await addDoc(collection(db, path), {
              url: compressedUrl,
              userId: user.uid,
              location: "Session Backup",
              outfit: "Session Backup",
              prompt: img.prompt,
              timestamp: serverTimestamp(),
            });
          } catch (e) {
            console.error("Failed to sync session image", e);
          }
        });
        await Promise.all(syncTasks);
        setIsSyncing(false);
      }
    } catch (e) {
      console.error("Login failed", e);
    }
  };

  const handleDeleteCloudImage = async (id: string) => {
    if (!auth.currentUser) return;
    const path = `users/${auth.currentUser.uid}/gallery/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  };

  const handleClearAllLocal = () => {
    setResults([]);
    setSelectedImage(null);
    setDeleteConfirm(null);
  };

  const handleDeleteLocalImage = (index: number) => {
    setResults(prev => prev.filter((_, i) => i !== index));
    if (selectedImage === index) setSelectedImage(null);
    else if (selectedImage !== null && selectedImage > index) setSelectedImage(selectedImage - 1);
  };

  const handleDeletePrompt = async (id: string | number, type: 'local' | 'cloud') => {
    if (type === 'local') {
      setPromptLog(prev => prev.filter(p => p.id !== id));
    } else {
      if (!auth.currentUser) return;
      const path = `users/${auth.currentUser.uid}/prompts/${id}`;
      try {
        await deleteDoc(doc(db, path));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, path);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currUser) => {
      setUser(currUser);
    });
    return () => unsubscribe();
  }, []);

  // Sync cloud gallery
  useEffect(() => {
    if (!user) {
      setGalleryItems([]);
      return;
    }

    setIsSyncing(true);
    const path = `users/${user.uid}/gallery`;
    const q = query(collection(db, path), orderBy("timestamp", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setGalleryItems(items);
      setIsSyncing(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  // Sync user profile (credits)
  useEffect(() => {
    if (!user) {
      setCredits(null);
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        setCredits(doc.data().credits ?? null);
      }
    }, (err) => {
      console.error("Failed to sync user profile", err);
    });

    return () => unsubscribe();
  }, [user]);

  // Sync cloud prompts
  useEffect(() => {
    if (!user) {
      setCloudPrompts([]);
      return;
    }

    const path = `users/${user.uid}/prompts`;
    const q = query(collection(db, path), orderBy("timestamp", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prompts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      }));
      setCloudPrompts(prompts);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDownload = (url: string, index: number) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `aura-gen-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleZoom = (type: 'in' | 'out' | 'reset') => {
    if (type === 'in') setZoomLevel(prev => Math.min(prev + 0.25, 3));
    if (type === 'out') setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
    if (type === 'reset') setZoomLevel(1);
  };

  useEffect(() => {
    if (selectedImage === null) {
      setZoomLevel(1);
    }
  }, [selectedImage]);

  return (
    <div className="min-h-screen text-white font-sans selection:bg-primary/30 relative overflow-x-hidden">
      {/* Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/5 blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header */}
      <header className="border-b border-glass-border bg-glass backdrop-blur-[20px] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-8 h-[60px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tighter uppercase bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              PONS AI
            </h1>
            
            <nav className="flex items-center gap-6 ml-8">
                <button 
                  onClick={() => setActiveTab('home')}
                  className={cn(
                    "flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase transition-all relative py-2",
                    activeTab === 'home' ? "text-primary" : "text-text-dim hover:text-white"
                  )}
                >
                  <Home className="w-3.5 h-3.5" />
                  Home
                  {activeTab === 'home' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                </button>
                <button 
                  onClick={() => setActiveTab('studio')}
                  className={cn(
                    "flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase transition-all relative py-2",
                    activeTab === 'studio' ? "text-primary" : "text-text-dim hover:text-white"
                  )}
                >
                  <Layout className="w-3.5 h-3.5" />
                  Studio
                  {activeTab === 'studio' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                </button>
                <button 
                  onClick={() => setActiveTab('video')}
                  className={cn(
                    "flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase transition-all relative py-2",
                    activeTab === 'video' ? "text-primary" : "text-text-dim hover:text-white"
                  )}
                >
                  <Video className="w-3.5 h-3.5" />
                  Video Generator
                  {activeTab === 'video' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                </button>
                <button 
                  onClick={() => setActiveTab('gallery')}
                  className={cn(
                    "flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase transition-all relative py-2",
                    activeTab === 'gallery' ? "text-primary" : "text-text-dim hover:text-white"
                  )}
                >
                  <Grid className="w-3.5 h-3.5" />
                  Gallery
                  {activeTab === 'gallery' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                </button>
                <button 
                  onClick={() => setActiveTab('logs')}
                  className={cn(
                    "flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase transition-all relative py-2",
                    activeTab === 'logs' ? "text-primary" : "text-text-dim hover:text-white"
                  )}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Prompt Logs
                  {activeTab === 'logs' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                </button>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            {user ? (
              <div className="flex items-center gap-6">
                <div className="hidden lg:flex items-center gap-4 pr-6 border-r border-white/5 h-8">
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim leading-none mb-1">Compute</span>
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                      <span className="text-[12px] font-black text-white">
                        {user?.email === 'sipapapons@gmail.com' ? "UNLIMITED" : (credits !== null ? `$${credits.toFixed(2)}` : "$0.00")}
                      </span>
                      {user.email !== 'sipapapons@gmail.com' && (
                        <button 
                          onClick={() => setIsTopUpOpen(true)}
                          className="w-5 h-5 bg-primary/10 hover:bg-primary text-primary hover:text-black rounded transition-all flex items-center justify-center ml-1"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {user?.email === 'sipapapons@gmail.com' && (
                  <button 
                    onClick={() => setIsAdminPanelOpen(true)}
                    className="hidden md:flex items-center gap-2 bg-secondary/10 hover:bg-secondary/20 text-secondary px-3 py-1.5 rounded-xl border border-secondary/20 transition-all relative"
                  >
                    <Target className="w-3 h-3" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Admin Control</span>
                    {pendingRequests.filter(r => r.status === 'pending').length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-black animate-bounce shadow-lg">
                        {pendingRequests.filter(r => r.status === 'pending').length}
                      </span>
                    )}
                  </button>
                )}

                <div className="relative">
                  <button 
                    onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                    className="flex items-center gap-3 pl-2 group transition-all"
                  >
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] font-bold leading-none">{user.displayName}</p>
                      <p className="text-[8px] text-text-dim uppercase tracking-tighter">{user.email}</p>
                    </div>
                    <div className="relative">
                      <img 
                        src={user.photoURL || ""} 
                        className="w-9 h-9 rounded-full border-2 border-glass-border group-hover:border-primary transition-all duration-300" 
                      />
                      <div className="absolute -bottom-1 -right-1 bg-primary w-3.5 h-3.5 rounded-full border-2 border-black flex items-center justify-center">
                        <ChevronDown className={cn("w-2 h-2 text-black transition-transform", isAccountMenuOpen && "rotate-180")} />
                      </div>
                    </div>
                  </button>

                <AnimatePresence>
                  {isAccountMenuOpen && (
                    <>
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40"
                        onClick={() => setIsAccountMenuOpen(false)}
                      />
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 mt-3 w-64 bg-[#0a0a0a]/95 backdrop-blur-[40px] border border-white/10 rounded-[24px] p-3 z-50 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-primary/5 -z-10" />
                        <div className="px-4 py-4 border-b border-white/5 mb-2 bg-white/5 rounded-2xl">
                          <p className="text-[12px] font-black tracking-tight text-white">{user.displayName}</p>
                          <p className="text-[10px] text-text-dim truncate mt-0.5">{user.email}</p>
                          <div className="flex items-center gap-1.5 mt-3">
                            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", user.email === 'sipapapons@gmail.com' ? "bg-secondary shadow-[0_0_8px_rgba(255,200,0,0.8)]" : "bg-[#00ff88]")} />
                            <span className={cn("text-[9px] font-bold tracking-widest uppercase", user.email === 'sipapapons@gmail.com' ? "text-secondary" : "text-[#00ff88]")}>
                              {user.email === 'sipapapons@gmail.com' ? "Verified Developer Account" : "Verified Account"}
                            </span>
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          <button 
                            onClick={() => {
                              handleLogin();
                              setIsAccountMenuOpen(false);
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-black text-white/90 hover:bg-white/5 rounded-xl transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-black transition-all">
                                <UserPlus className="w-4 h-4" />
                              </div>
                              <span className="tracking-widest uppercase">ADD ACCOUNT</span>
                            </div>
                            <ChevronRight className="w-3 h-3 text-text-dim group-hover:translate-x-1 transition-transform" />
                          </button>
                          
                          <button 
                            onClick={() => {
                              signOut(auth);
                              setIsAccountMenuOpen(false);
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-black text-red-400 hover:bg-red-500/10 rounded-xl transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 group-hover:bg-red-500 group-hover:text-white transition-all">
                                <LogOut className="w-4 h-4" />
                              </div>
                              <span className="tracking-widest uppercase">LOG OUT</span>
                            </div>
                          </button>
                        </div>

                        <div className="mt-2 pt-2 border-t border-white/5 px-4 pb-1">
                          <p className="text-[8px] text-text-dim uppercase tracking-[0.2em] font-bold">Session ID: {user.uid.slice(0, 8)}...</p>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
              <Button 
                variant="outline" 
                size="sm" 
                className="bg-primary hover:bg-primary/90 text-black border-none text-[10px] h-8 font-bold px-4 rounded-full shadow-lg shadow-primary/20"
                onClick={handleLogin}
              >
                SIGN IN
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-12">
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ height: 0, opacity: 0, marginBottom: 0 }}
              animate={{ height: "auto", opacity: 1, marginBottom: 32 }}
              exit={{ height: 0, opacity: 0, marginBottom: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-4 text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div className="flex-1 text-[13px] font-medium">{error}</div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 hover:bg-red-500/20 text-red-400" 
                  onClick={() => setError(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-24 pb-20"
            >
              {/* Hero Section */}
              <section className="text-center space-y-10 pt-16 relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-primary/5 blur-[120px] -z-10 rounded-full" />
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <span className="h-[1px] w-8 bg-primary/40" />
                    <h2 className="text-[11px] font-bold tracking-[0.5em] text-primary uppercase">
                      The Gold Standard of AI Persona
                    </h2>
                    <span className="h-[1px] w-8 bg-primary/40" />
                  </div>
                  <h1 className="text-6xl md:text-8xl font-black tracking-tighter uppercase leading-[0.9] max-w-5xl mx-auto">
                    Instagram Image <br />
                    <span className="font-serif italic font-normal text-primary lowercase tracking-normal">Generator</span> <br />
                    <span className="bg-gradient-to-b from-white to-white/30 bg-clip-text text-transparent">
                      For Your AI Influencer ✨
                    </span>
                  </h1>
                </motion.div>
                
                <p className="text-xl text-text-dim max-w-2xl mx-auto leading-relaxed font-light font-sans">
                  Craft a persistent digital presence with photorealistic precision. From viral carousels to luxury OOTDs, PONS AI is the creative engine for the next generation of social entrepreneurs.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
                  <Button 
                    onClick={() => setActiveTab('studio')}
                    className="h-16 px-12 bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-widest rounded-full shadow-[0_10px_40px_rgba(0,242,255,0.4)] active:scale-95 transition-all text-sm"
                  >
                    Enter The Studio
                  </Button>
                  <Button 
                    variant="ghost"
                    onClick={() => {
                      const el = document.getElementById('how-it-works');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="h-16 px-12 border border-white/10 hover:bg-white/5 text-white font-black uppercase tracking-widest rounded-full active:scale-95 transition-all text-sm"
                  >
                    How It Works
                  </Button>
                </div>
              </section>

              {/* What You Can Create - Carousel Focus */}
              <section className="space-y-16">
                <div className="text-center space-y-4">
                  <h3 className="text-[11px] font-bold tracking-[0.4em] text-primary uppercase">Elite Content Formats</h3>
                  <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic font-serif">Viral Aesthetics</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {[
                    {
                      label: "OOTD & Fashion",
                      img: "https://picsum.photos/seed/fashion/1080/1920",
                      tags: ["LUXURY", "EDITORIAL"]
                    },
                    {
                      label: "Travel & Lifestyle",
                      img: "https://picsum.photos/seed/travel/1080/1920",
                      tags: ["WANDERLUST", "2K"]
                    },
                    {
                      label: "Fitness & Wellness",
                      img: "https://picsum.photos/seed/fitness/1080/1920",
                      tags: ["ATHLEISURE", "HDR"]
                    },
                    {
                      label: "Home & Interior",
                      img: "https://picsum.photos/seed/interior/1080/1920",
                      tags: ["MINIMALISM", "COZY"]
                    }
                  ].map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, scale: 0.95 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className="group relative aspect-[9/16] rounded-[32px] overflow-hidden border border-white/10"
                    >
                      <img src={item.img} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                      <div className="absolute bottom-0 left-0 p-8 space-y-3 w-full">
                        <div className="flex gap-2">
                          {item.tags.map(tag => (
                            <span key={tag} className="text-[8px] font-black tracking-widest text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">{tag}</span>
                          ))}
                        </div>
                        <h4 className="text-xl font-bold uppercase tracking-tight text-white">{item.label}</h4>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>

              {/* How It Works */}
              <section id="how-it-works" className="bg-glass/30 border border-glass-border rounded-[60px] p-12 md:p-24 backdrop-blur-3xl relative overflow-hidden">
                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-primary/10 to-transparent -z-10" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
                  <div className="space-y-12">
                    <div className="space-y-6">
                      <h3 className="text-primary font-black uppercase tracking-[0.3em] text-[12px]">The Workflow</h3>
                      <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none italic font-serif text-white">
                        Three Steps <br />to Presence.
                      </h2>
                    </div>

                    <div className="space-y-10">
                      {[
                        { step: "01", title: "Identity Lock", desc: "Upload a single reference photo. Our engine extracts the exact bone structure and personality traits to ensure 100% consistency." },
                        { step: "02", title: "Global Studio", desc: "Select or define custom locations and outfits. From Parisian balconies to beach clubs in Bali, the world is your set." },
                        { step: "03", title: "Daily Scale", desc: "Generate batches of up to 10 photorealistic shots for your daily posts and viral carousels in seconds." }
                      ].map((s) => (
                        <div key={s.step} className="flex gap-8 group">
                          <span className="text-5xl font-black text-white/5 group-hover:text-primary/20 transition-colors font-serif italic leading-none">{s.step}</span>
                          <div className="space-y-2">
                            <h4 className="text-xl font-black uppercase tracking-tight text-white">{s.title}</h4>
                            <p className="text-text-dim text-sm leading-relaxed font-light">{s.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-[120px] rounded-full animate-pulse" />
                    <div className="relative bg-black/40 border border-white/10 rounded-[48px] p-8 aspect-square overflow-hidden shadow-2xl">
                      <div className="grid grid-cols-2 gap-4 h-full">
                        <div className="space-y-4">
                          <img src="https://picsum.photos/seed/a/400/600" className="rounded-3xl border border-white/5 opacity-80" referrerPolicy="no-referrer" />
                          <img src="https://picsum.photos/seed/b/400/300" className="rounded-3xl border border-white/5 opacity-40 blur-sm" referrerPolicy="no-referrer" />
                        </div>
                        <div className="space-y-4 pt-12">
                          <img src="https://picsum.photos/seed/c/400/300" className="rounded-3xl border border-white/5 opacity-60" referrerPolicy="no-referrer" />
                          <img src="https://picsum.photos/seed/d/400/600" className="rounded-3xl border border-white/5 opacity-90" referrerPolicy="no-referrer" />
                        </div>
                      </div>
                      <div className="absolute inset-x-8 bottom-8 p-6 bg-black/80 backdrop-blur-xl border border-primary/20 rounded-3xl text-center">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Check className="w-3 h-3 text-primary" />
                          <span className="text-[10px] font-black tracking-widest text-primary uppercase">Identity Verified</span>
                        </div>
                        <p className="text-[10px] text-text-dim uppercase font-bold tracking-tighter">Persistent Model Hash: PX-9022</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Advanced Features */}
              <section className="space-y-12">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-8">
                  <div className="space-y-4">
                    <h3 className="text-[11px] font-bold tracking-[0.4em] text-primary uppercase">Pro Features</h3>
                    <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter">Technical Precision</h2>
                  </div>
                  <p className="max-w-md text-text-dim text-sm font-light leading-relaxed">
                    Designed for creators who demand zero identity drift and professional-grade rendering settings.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    {
                      icon: Target,
                      title: "Face Lock Pro",
                      desc: "Our proprietary cross-frame identity engine maintains uncanny resemblance in every pose."
                    },
                    {
                      icon: Layers,
                      title: "Batch Carousels",
                      desc: "Generate consistent visual stories with up to 10 matching shots in a single click."
                    },
                    {
                      icon: Camera,
                      title: "Optic Physics",
                      desc: "Simulate specific focal lengths, apertures, and professional lighting setups."
                    },
                    {
                      icon: History,
                      title: "Legacy Archive",
                      desc: "Every prompt and setting is stored permanently in your cloud-synced technical log."
                    },
                    {
                      icon: Layout,
                      title: "Multi-Platform",
                      desc: "Preset ratios for Instagram Posts, Stories, Reels, and Pinterest Aesthetic Pins."
                    },
                    {
                      icon: Sparkles,
                      title: "8K Polish",
                      desc: "High-frequency skin texture and realism that satisfies the closest digital zoom."
                    }
                  ].map((feat, i) => (
                    <motion.div
                      key={feat.title}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      viewport={{ once: true }}
                      className="group p-10 bg-[#0c0c16]/50 border border-white/5 rounded-[40px] hover:border-primary/50 transition-all hover:bg-primary/[0.03] relative overflow-hidden"
                    >
                      <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-8 text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-black transition-all duration-700">
                        <feat.icon className="w-7 h-7" />
                      </div>
                      <h4 className="text-2xl font-bold mb-4 uppercase tracking-tighter italic font-serif">{feat.title}</h4>
                      <p className="text-sm text-text-dim leading-relaxed font-light">
                        {feat.desc}
                      </p>
                      <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-primary/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                  ))}
                </div>
              </section>

              {/* Call to Action */}
              <section className="bg-primary p-16 md:p-32 rounded-[60px] text-center space-y-12 relative overflow-hidden group">
                <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/luxury/1920/1080')] bg-cover bg-center opacity-10 grayscale group-hover:scale-110 transition-transform duration-[20s]" />
                <div className="absolute inset-0 bg-primary opacity-90" />
                <div className="relative z-10 space-y-8">
                  <h3 className="text-6xl md:text-8xl font-serif italic text-black tracking-tighter leading-none lowercase">
                    Enter the studio.
                  </h3>
                  <h2 className="text-2xl md:text-3xl font-black text-black uppercase tracking-[0.2em]">
                    Join the 1% of AI Creators
                  </h2>
                  <Button 
                    onClick={() => setActiveTab('studio')}
                    className="h-20 px-16 bg-black text-white hover:bg-[#111] font-black uppercase tracking-[0.3em] rounded-full text-lg shadow-[0_20px_50px_rgba(0,0,0,0.3)] active:scale-95 transition-all"
                  >
                    Enter The Studio
                  </Button>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'studio' && (
            <motion.div 
              key="studio"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              {/* Left Column: Controls */}
              <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#121212]/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 space-y-8">
            {/* Header for Controls */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <Layout className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-[13px] font-black tracking-widest uppercase italic font-serif">Creative Atelier</h3>
                <p className="text-[9px] text-text-dim uppercase tracking-tighter">Aesthetic Architecture</p>
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Section 1: Identity */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-primary font-serif italic">01</span>
                <Label className="text-[10px] font-black uppercase tracking-widest text-text-dim">The Identity Blueprint</Label>
              </div>
              <Card 
                className="bg-black/40 border-2 border-dashed border-white/10 rounded-2xl overflow-hidden group cursor-pointer hover:border-primary/50 transition-all duration-300" 
                onClick={() => fileInputRef.current?.click()}
              >
                <CardContent className="p-0 aspect-[16/9] flex flex-col items-center justify-center relative">
                  {faceImage ? (
                    <div className="relative w-full h-full group">
                      <img src={faceImage} alt="Reference" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm">
                        <Upload className="w-6 h-6 text-primary mb-2" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Change Photo</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-6 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary group-hover:text-black transition-all">
                        <UserIcon className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-black uppercase tracking-widest">Upload your avatar</p>
                        <p className="text-[9px] text-text-dim tracking-tight">PNG, JPG up to 10MB</p>
                      </div>
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    className="hidden" 
                    accept="image/*"
                  />
                </CardContent>
              </Card>
            </section>

            {/* Section 2: Environment */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-primary font-serif italic">02</span>
                  <Label className="text-[10px] font-black uppercase tracking-widest text-text-dim">The Eternal Set</Label>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-[9px] font-black tracking-widest uppercase text-primary/60 hover:text-primary hover:bg-primary/10 px-3 rounded-full active:scale-90 transition-all" onClick={randomizeLocation}>
                  <RefreshCw className="w-3 h-3 mr-1.5" /> Shuffle
                </Button>
              </div>
              <RadioGroup value={location} onValueChange={setLocation} className="grid grid-cols-2 gap-2 relative">
                <AnimatePresence mode="wait">
                  {visibleLocations.map((loc, i) => (
                    <motion.div 
                      key={`location-${loc}-${i}`} 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.1 }}
                      className="relative"
                    >
                      <RadioGroupItem value={loc} id={`loc-${loc}`} className="peer sr-only" />
                      <Label
                        htmlFor={`loc-${loc}`}
                        className="relative flex items-center justify-center py-2.5 px-2 text-[11px] font-bold bg-white/5 border border-white/5 rounded-xl cursor-pointer transition-all hover:bg-white/10 overflow-hidden group"
                      >
                        {location === loc && !customLocation && (
                          <motion.div
                            layoutId="location-bg"
                            className="absolute inset-0 bg-primary shadow-[0_0_20px_rgba(0,242,255,0.3)]"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                          />
                        )}
                        <span className={cn(
                          "relative z-10 transition-colors tracking-tight truncate",
                          (location === loc && !customLocation) ? "text-black" : "text-white/40 group-hover:text-white"
                        )}>
                          {loc}
                        </span>
                      </Label>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </RadioGroup>

              <div className="relative group pt-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors">
                  <Target className="w-3.5 h-3.5" />
                </div>
                <input 
                  type="text"
                  placeholder="CUSTOM LOCATION..."
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-10 pr-10 text-[11px] font-bold tracking-widest uppercase focus:border-primary/50 focus:bg-primary/5 outline-none transition-all placeholder:text-white/10"
                />
                {customLocation && (
                  <button 
                    onClick={() => setCustomLocation("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full text-text-dim hover:text-white transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </section>

            {/* Section 3: Style */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-primary font-serif italic">03</span>
                  <Label className="text-[10px] font-black uppercase tracking-widest text-text-dim">Couture Selection</Label>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-[9px] font-black tracking-widest uppercase text-primary/60 hover:text-primary hover:bg-primary/10 px-3 rounded-full active:scale-90 transition-all" onClick={randomizeOutfit}>
                  <RefreshCw className="w-3 h-3 mr-1.5" /> Shuffle
                </Button>
              </div>
              <RadioGroup value={outfit} onValueChange={setOutfit} className="grid grid-cols-2 gap-2 relative">
                <AnimatePresence mode="wait">
                  {visibleOutfits.map((style, i) => (
                    <motion.div 
                      key={`outfit-${style}-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.1 }}
                      className="relative"
                    >
                      <RadioGroupItem value={style} id={`style-${style}`} className="peer sr-only" />
                      <Label
                        htmlFor={`style-${style}`}
                        className="relative flex items-center justify-center py-2.5 px-2 text-[11px] font-bold bg-white/5 border border-white/5 rounded-xl cursor-pointer transition-all hover:bg-white/10 overflow-hidden group"
                      >
                        {outfit === style && !customOutfit && (
                          <motion.div
                            layoutId="outfit-bg"
                            className="absolute inset-0 bg-primary shadow-[0_0_20px_rgba(0,242,255,0.3)]"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                          />
                        )}
                        <span className={cn(
                          "relative z-10 transition-colors tracking-tight truncate",
                          (outfit === style && !customOutfit) ? "text-black" : "text-white/40 group-hover:text-white"
                        )}>
                          {style}
                        </span>
                      </Label>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </RadioGroup>

              <div className="relative group pt-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <input 
                  type="text"
                  placeholder="CUSTOM OUTFIT..."
                  value={customOutfit}
                  onChange={(e) => setCustomOutfit(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-10 pr-10 text-[11px] font-bold tracking-widest uppercase focus:border-primary/50 focus:bg-primary/5 outline-none transition-all placeholder:text-white/10"
                />
                {customOutfit && (
                  <button 
                    onClick={() => setCustomOutfit("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full text-text-dim hover:text-white transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </section>

            {/* Section 4: Configuration */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-primary font-serif italic">04</span>
                  <Label className="text-[10px] font-black uppercase tracking-widest text-text-dim">Visual Volume</Label>
                </div>
                <div className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
                  <span className="text-[12px] font-black text-primary">{imageCount} PHOTOREAL SHOTS</span>
                </div>
              </div>
              
              <div className="grid grid-cols-5 gap-2 relative bg-black/20 p-2 rounded-2xl border border-white/5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setImageCount(num)}
                    className="h-10 relative flex items-center justify-center rounded-xl border text-[11px] font-black transition-all duration-300 bg-white/5 border-transparent text-white/20 hover:text-white overflow-hidden group active:scale-95"
                  >
                    {imageCount === num && (
                      <motion.div
                        layoutId="count-bg"
                        className="absolute inset-0 bg-primary shadow-[0_0_15px_rgba(0,242,255,0.4)]"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className={cn(
                      "relative z-10 transition-colors duration-300",
                      imageCount === num ? "text-black" : ""
                    )}>
                      {num}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <Separator className="bg-white/5" />

            {/* Action */}
            <div className="pt-2">
              <Button 
                className={cn(
                  "w-full h-[64px] rounded-2xl text-black font-black text-[15px] tracking-[0.3em] uppercase shadow-[0_15px_30px_rgba(0,0,0,0.3)] transition-all duration-500 active:scale-[0.96] font-serif italic",
                  !faceImage ? "bg-white/5 text-white/20 cursor-not-allowed" : "bg-primary hover:bg-primary/90 hover:shadow-primary/20"
                )}
                disabled={isGenerating || !faceImage}
                onClick={handleGenerate}
              >
                {isGenerating ? (
                  <div className="flex items-center gap-4">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Rendering...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5" />
                    <span>Render Collection</span>
                  </div>
                )}
              </Button>
              
              {!user && (
                <div className="mt-6 p-4 rounded-2xl bg-[#00ff88]/5 border border-[#00ff88]/10 text-center">
                  <p className="text-[9px] font-black text-[#00ff88] uppercase tracking-[0.2em] mb-1">Warning: Session Temporary</p>
                  <p className="text-[10px] text-text-dim">Connect your cloud account to preserve these identifiers permanently.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-[24px] font-bold mb-1 uppercase tracking-tighter italic font-serif">The Carousel Gallery</h2>
              <p className="text-[14px] text-text-dim font-light">Maintaining facial consistency for your elite AI Persona. High-fidelity renders with zero identity drift.</p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-4 bg-glass/50 border border-glass-border px-5 py-3 rounded-2xl shadow-lg backdrop-blur-sm">
                <div className="text-right">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-dim block mb-0.5">Engine Status</span>
                  <div className={cn(
                    "text-[13px] font-black uppercase tracking-widest flex items-center gap-3 justify-end transition-all duration-500",
                    isGenerating ? "text-primary" : "text-[#00ff88]"
                  )}>
                    <div className="relative flex items-center justify-center">
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full z-10",
                        isGenerating ? "bg-primary" : "bg-[#00ff88]"
                      )} />
                      <div className={cn(
                        "absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-75",
                        isGenerating ? "bg-primary" : "bg-[#00ff88]"
                      )} />
                      {!isGenerating && (
                        <div className="absolute inset-0 w-6 h-6 -m-[7px] bg-[#00ff88]/20 blur-md rounded-full animate-pulse" />
                      )}
                    </div>
                    <span>{isGenerating ? "Processing Generation" : "Ready to Process"}</span>
                  </div>
                </div>
              </div>
              {results.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setDeleteConfirm({ id: 'all', type: 'clear-all' })}
                  className="h-8 text-[11px] font-bold text-red-400 hover:text-red-500 hover:bg-red-500/10 gap-2 border border-red-500/20 px-4 rounded-full"
                >
                  <RefreshCw className="w-3 h-3" />
                  CLEAR SESSION
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-220px)] pr-4">
            <div className="space-y-12 pb-20">
              {/* Active Batch */}
              <section className="space-y-6">
                {results.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                    <AnimatePresence mode="popLayout">
                      {results.map((img, idx) => (
                        <motion.div
                          key={`result-${idx}-${img.prompt.substring(0, 10)}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className="group relative aspect-[9/16] bg-[#121212] border border-white/5 rounded-3xl overflow-hidden cursor-zoom-in transition-all duration-500 hover:border-primary/50"
                          onClick={() => setSelectedImage(idx)}
                        >
                          <img 
                            src={img.url} 
                            alt={`Generated ${idx}`} 
                            loading="lazy" 
                            decoding="async" 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" 
                          />
                          
                          {/* Top Actions Overlay */}
                          <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-10 h-10 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 hover:bg-primary hover:text-black transition-all"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(img.url, idx);
                              }}
                            >
                              <Download className="w-5 h-5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-10 h-10 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 hover:bg-red-500 hover:text-white transition-all shadow-lg"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm({ id: idx, type: 'local' });
                              }}
                            >
                              <X className="w-5 h-5" />
                            </Button>
                          </div>

                          {/* Info Overlay */}
                          <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-[9px] font-black uppercase tracking-widest border border-primary/20">
                                Shot {idx + 1}
                              </span>
                              <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Photoreal Engine</span>
                            </div>
                            {img.prompt && (
                              <p className="text-[11px] text-white/80 line-clamp-2 leading-relaxed italic">
                                "{img.prompt}"
                              </p>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                    {Array.from({ length: imageCount }).map((_, i) => (
                      <div key={`pending-slot-${i}`} className="aspect-[9/16] bg-glass border border-glass-border rounded-2xl flex flex-col items-center justify-center p-8 text-center">
                        <ImageIcon className="w-10 h-10 text-white/10 mb-4" />
                        <div className="text-[10px] text-text-dim uppercase font-bold mb-1">Shot {i + 1}</div>
                        <div className="text-[13px] font-medium text-white/30">Pending Generation</div>
                      </div>
                    ))}
                    
                    <div className="col-span-full bg-black/30 border border-white/5 rounded-lg p-4 flex justify-between items-center text-[11px] text-text-dim mt-4">
                      <span>Estimated Batch Cost: <strong className="text-[#00ff88]">${(imageCount * 0.04).toFixed(2)}</strong></span>
                      <span>Batch processing enabled ({imageCount} images/call)</span>
                      <span>Resolution: 1024x1024 (Standard 9:16)</span>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </ScrollArea>
        </div>
      </motion.div>
    )}

    {activeTab === 'gallery' && (
      <motion.div 
        key="gallery"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="space-y-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[32px] font-extrabold tracking-tight uppercase tracking-tighter italic font-serif">Cloud Vault</h2>
            <p className="text-text-dim">Your permanent archive of AI-generated identities and cinematic motion.</p>
          </div>
          {isSyncing && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
        </div>

        {user ? (
          galleryItems.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {galleryItems.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: (idx % 10) * 0.05 }}
                  className="group relative aspect-[9/16] bg-glass border border-glass-border rounded-3xl overflow-hidden shadow-xl hover:border-primary/50 transition-all duration-500 cursor-zoom-in"
                  onDoubleClick={() => setSelectedImage(idx)}
                >
                  {item.type === 'video' ? (
                    <video 
                      src={item.url} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      muted
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                  ) : (
                    <img src={item.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="Gallery item" />
                  )}

                  <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                        item.type === 'video' ? "bg-secondary/20 text-secondary border-secondary/20" : "bg-primary/20 text-primary border-primary/20"
                      )}>
                        {item.type === 'video' ? 'Video' : 'Image'}
                      </span>
                      <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">
                        {item.timestamp ? new Date(item.timestamp.toDate()).toLocaleDateString() : 'Syncing'}
                      </span>
                    </div>
                    {item.prompt && (
                      <p className="text-[10px] text-white/70 line-clamp-2 leading-relaxed italic mb-4">
                        "{item.prompt}"
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="flex-1 h-8 bg-white/5 hover:bg-white hover:text-black rounded-xl text-[10px] font-bold"
                        onClick={() => handleDownload(item.url, idx)}
                      >
                        <Download className="w-3.5 h-3.5 mr-2" />
                        GET
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="w-8 h-8 bg-red-500/10 hover:bg-red-500 text-white rounded-xl"
                        onClick={() => setDeleteConfirm({ id: item.id, type: 'cloud' })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {item.type === 'video' && (
                    <div className="absolute top-4 left-4 w-8 h-8 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center">
                      <Video className="w-4 h-4 text-white" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.02] text-center space-y-6">
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center">
                <Grid className="w-10 h-10 text-white/10" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-black uppercase tracking-widest italic font-serif">The Archive is Silent</h4>
                <p className="text-xs text-text-dim max-w-xs mx-auto">Your generated portfolio will appear here once you start creating in the studio or motion atelier.</p>
              </div>
              <Button onClick={() => setActiveTab('studio')} className="bg-primary/20 text-primary hover:bg-primary/30 rounded-full px-8 text-[11px] font-bold">
                OPEN STUDIO
              </Button>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-32 bg-glass border border-glass-border rounded-[40px] text-center space-y-6">
            <Cloud className="w-12 h-12 text-primary/30" />
            <div className="space-y-2">
              <h4 className="text-xl font-bold">Authentication Required</h4>
              <p className="text-xs text-text-dim max-w-xs mx-auto">Sign in to unlock your persistent cloud gallery and sync all your creations across devices.</p>
            </div>
            <Button onClick={handleLogin} className="bg-primary text-black font-black px-10 rounded-2xl h-14">
              CONNECT ACCOUNT
            </Button>
          </div>
        )}
      </motion.div>
    )}
    {activeTab === 'logs' && (
      <motion.div 
        key="logs"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="space-y-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[32px] font-extrabold tracking-tight">Prompt Logs</h2>
            <p className="text-text-dim">Technical history of all active generation prompts.</p>
          </div>
        </div>

        <div className="space-y-4">
          {(() => {
            const allPrompts = [
              ...promptLog.map(p => ({ ...p, type: 'local' as const })),
              ...cloudPrompts.map(p => ({ ...p, type: 'cloud' as const }))
            ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

            return allPrompts.length > 0 ? (
              allPrompts.map((log, idx) => (
                <motion.div 
                  key={`${log.type}-${log.id}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-glass border border-glass-border rounded-2xl p-6 relative overflow-hidden group shadow-lg hover:border-primary/30 transition-all"
                >
                  <div className="absolute top-0 right-0 p-4 flex items-center gap-3">
                    {log.type === 'cloud' && <Sparkles className="w-3 h-3 text-primary animate-pulse" />}
                    <span className="text-[10px] font-mono text-primary/50">{log.timestamp.toLocaleTimeString()}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-8 h-8 rounded-full text-white/20 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                      onClick={() => setPromptDeleteConfirm({ id: log.id, type: log.type })}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-4 mb-4">
                    <div className={cn(
                      "text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-2",
                      log.type === 'video' ? "bg-secondary/20 text-secondary" : "bg-primary/20 text-primary"
                    )}>
                      {log.type === 'video' ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                      {log.type === 'video' ? 'Video' : 'Image'}
                    </div>
                    <div className="bg-white/5 border border-white/10 text-white/40 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                      {log.location}
                    </div>
                    <div className="bg-white/5 border border-white/10 text-white/40 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                      {log.outfit}
                    </div>
                  </div>

                  <div className="bg-black/60 rounded-2xl border border-white/5 relative overflow-hidden shadow-2xl">
                    <div className="bg-white/5 px-6 py-3 border-b border-white/5 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-dim flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5" />
                        Detailed Engine Prompt
                      </span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 px-4 text-[10px] font-bold bg-white/5 hover:bg-white hover:text-black border border-white/10"
                        onClick={() => {
                          navigator.clipboard.writeText(log.prompt);
                        }}
                      >
                        <Copy className="w-3 h-3 mr-2" />
                        COPY
                      </Button>
                    </div>
                    <ScrollArea className="max-h-[400px]">
                      <div className="p-8">
                        <pre className="text-[13px] font-mono text-white/90 whitespace-pre-wrap leading-relaxed selection:bg-primary/40 selection:text-black">
                          {log.prompt}
                        </pre>
                      </div>
                    </ScrollArea>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-24 bg-glass border border-glass-border rounded-3xl opacity-50">
                <RefreshCw className="w-12 h-12 text-white/10 mb-4" />
                <p className="text-white/30 font-bold uppercase tracking-widest text-xs">No active logs available</p>
                <p className="text-[10px] text-white/20 mt-2">Generate your first batch to start logging.</p>
              </div>
            );
          })()}
        </div>
      </motion.div>
    )}

    {activeTab === 'video' && (
      <motion.div 
        key="video"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8"
      >
        {/* Left Column: Video Controls */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#121212]/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <Video className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-[13px] font-black tracking-widest uppercase italic font-serif">Motion Atelier</h3>
                <p className="text-[9px] text-text-dim uppercase tracking-tighter">Cinematic Motion Engine</p>
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Video Identity Reference */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-primary font-serif italic">01</span>
                <Label className="text-[10px] font-black uppercase tracking-widest text-text-dim">Video Character Base</Label>
              </div>
              <Card 
                className="bg-black/40 border-2 border-dashed border-white/10 rounded-2xl overflow-hidden group cursor-pointer hover:border-primary/50 transition-all duration-300" 
                onClick={() => videoInputRef.current?.click()}
              >
                <CardContent className="p-0 aspect-[9/16] flex flex-col items-center justify-center relative">
                  {videoReferenceImage ? (
                    <div className="relative w-full h-full group">
                      <img src={videoReferenceImage} alt="Video Reference" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm">
                        <Upload className="w-6 h-6 text-primary mb-2" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Change Persona</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-6 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary group-hover:text-black transition-all">
                        <Video className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-black uppercase tracking-widest">Upload Portrait</p>
                        <p className="text-[9px] text-text-dim tracking-tight">Base for consistent movement</p>
                      </div>
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={videoInputRef} 
                    onChange={handleVideoUpload} 
                    className="hidden" 
                    accept="image/*"
                  />
                </CardContent>
              </Card>
            </section>

            <Separator className="bg-white/5" />

            {/* Action */}
            <div className="space-y-4">
              <Button 
                className={cn(
                  "w-full h-[64px] rounded-2xl text-black font-black text-[15px] tracking-[0.3em] uppercase shadow-[0_15px_30px_rgba(0,0,0,0.3)] transition-all duration-500 active:scale-[0.96] font-serif italic",
                  !videoReferenceImage || isGeneratingVideo ? "bg-white/5 text-white/20 cursor-not-allowed" : "bg-primary hover:bg-primary/90 hover:shadow-primary/20"
                )}
                disabled={isGeneratingVideo || !videoReferenceImage}
                onClick={handleGenerateVideo}
              >
                {isGeneratingVideo ? (
                  <div className="flex items-center gap-4">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Filming...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5" />
                    <span>Animate Identity</span>
                  </div>
                )}
              </Button>

              {videoError && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-center">
                  <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">{videoError}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Video Output */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-[24px] font-bold mb-1 uppercase tracking-tighter italic font-serif">Cinematic Results</h2>
              <p className="text-[14px] text-text-dim font-light">Transforming consistent personas into dynamic motion. Vertical cinema for social platforms.</p>
            </div>
            <div className="bg-glass/50 border border-glass-border px-5 py-3 rounded-2xl shadow-lg backdrop-blur-sm">
                <div className="text-right">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-dim block mb-0.5">Motion Status</span>
                  <div className={cn(
                    "text-[13px] font-black uppercase tracking-widest flex items-center gap-3 justify-end transition-all duration-500",
                    isGeneratingVideo ? "text-primary" : "text-[#00ff88]"
                  )}>
                    <div className="relative flex items-center justify-center">
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full z-10",
                        isGeneratingVideo ? "bg-primary" : "bg-[#00ff88]"
                      )} />
                      <div className={cn(
                        "absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-75",
                        isGeneratingVideo ? "bg-primary" : "bg-[#00ff88]"
                      )} />
                    </div>
                    <span>{isGeneratingVideo ? "Filming Sequence" : "Set Ready"}</span>
                  </div>
                </div>
            </div>
          </div>

          <div className="bg-[#121212]/50 backdrop-blur-sm border border-white/5 rounded-[40px] aspect-[9/16] max-h-[80vh] mx-auto overflow-hidden relative flex items-center justify-center group shadow-2xl">
            {generatedVideoUrl ? (
              <div className="relative w-full h-full">
                <video 
                  src={generatedVideoUrl} 
                  controls 
                  autoPlay 
                  loop 
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-12 h-12 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 hover:bg-primary hover:text-black transition-all"
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = generatedVideoUrl;
                      a.download = `pons_ai_video_${Date.now()}.mp4`;
                      a.click();
                    }}
                  >
                    <Download className="w-6 h-6" />
                  </Button>
                </div>
              </div>
            ) : isGeneratingVideo ? (
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Video className="w-8 h-8 text-primary animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-black uppercase tracking-widest italic font-serif">Rendering Cinematic Motion</h4>
                  <p className="text-xs text-text-dim max-w-sm mx-auto">Our director engine is animating your persona frame by frame. This takes a few moments to ensure zero identity drift.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-6 opacity-40 hover:opacity-100 transition-opacity">
                <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <Video className="w-12 h-12 text-white/20" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-black uppercase tracking-widest italic font-serif">No Scene Rendered</h4>
                  <p className="text-xs text-text-dim max-w-xs mx-auto">Upload an identity reference and click 'Animate Identity' to generate your first vertical video sequence.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    )}
    </AnimatePresence>
  </main>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedImage !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-6"
            onClick={() => setSelectedImage(null)}
          >
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-6 right-6 text-white/40 hover:text-white"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-8 h-8" />
            </Button>

            <div className="relative max-w-4xl w-full flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
              <div 
                className="relative w-full aspect-square overflow-hidden rounded-2xl border border-glass-border bg-black"
                onWheel={(e) => {
                  if (e.deltaY < 0) handleZoom('in');
                  else handleZoom('out');
                }}
                onDoubleClick={() => handleZoom(zoomLevel === 1 ? 'in' : 'reset')}
              >
                {currentSelectedImage && (
                  currentSelectedImage.type === 'video' ? (
                    <video 
                      src={currentSelectedImage.url} 
                      controls 
                      autoPlay 
                      loop 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <motion.img 
                      animate={{ scale: zoomLevel }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      src={currentSelectedImage.url} 
                      alt="Enlarged" 
                      className="w-full h-full object-contain cursor-grab active:cursor-grabbing"
                      drag={zoomLevel > 1}
                      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    />
                  )
                )}
              </div>

              {/* Controls Bar */}
              <div className="flex flex-col items-center gap-4 w-full">
                <div className="flex items-center gap-4 bg-glass border border-glass-border px-6 py-3 rounded-full backdrop-blur-xl shadow-2xl">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-white/60 hover:text-white" onClick={() => handleZoom('out')}>
                      <ZoomOut className="w-4 h-4" />
                    </Button>
                    <div className="w-32">
                      <Slider
                        value={[zoomLevel]}
                        min={0.5}
                        max={3}
                        step={0.1}
                        onValueChange={(vals) => setZoomLevel(Array.isArray(vals) ? vals[0] : vals)}
                        className="cursor-pointer"
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-white/60 hover:text-white" onClick={() => handleZoom('in')}>
                      <ZoomIn className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="w-[1px] h-6 bg-glass-border" />
                  <span className="text-[10px] font-mono font-bold w-12 text-center text-primary">{Math.round(zoomLevel * 100)}%</span>
                  <div className="w-[1px] h-6 bg-glass-border" />
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-white/60 hover:text-white" onClick={() => handleZoom('reset')}>
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  <div className="w-[1px] h-6 bg-glass-border" />
                  <Button variant="ghost" size="icon" className="w-10 h-10 text-primary hover:bg-primary/20 rounded-full" onClick={() => {
                    if (currentSelectedImage) handleDownload(currentSelectedImage.url, selectedImage!);
                  }}>
                    <Download className="w-5 h-5" />
                  </Button>
                  <div className="w-[1px] h-6 bg-glass-border" />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-10 h-10 text-red-400 hover:bg-red-500/20 rounded-full" 
                    onClick={() => {
                      if (selectedImage !== null) {
                        if (activeTab === 'studio') {
                          setDeleteConfirm({ id: selectedImage, type: 'local' });
                        } else {
                          setDeleteConfirm({ id: galleryItems[selectedImage].id, type: 'cloud' });
                        }
                      }
                    }}
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>

                {currentSelectedImage && currentSelectedImage.prompt && (
                  <div className="max-w-3xl w-full bg-glass/60 border border-glass-border rounded-2xl p-6 relative group overflow-hidden shadow-2xl backdrop-blur-3xl">
                    <div className="flex items-center justify-between mb-3 text-text-dim">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Generation Prompt</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-[10px] font-bold bg-white/5 hover:bg-white hover:text-black border border-white/10"
                        onClick={() => {
                          navigator.clipboard.writeText(currentSelectedImage.prompt);
                        }}
                      >
                        COPY FULL PROMPT
                      </Button>
                    </div>
                    <ScrollArea className="max-h-[200px] pr-4">
                      <p className="text-sm font-medium text-white/90 leading-relaxed font-sans selection:bg-primary/30">
                        {currentSelectedImage.prompt}
                      </p>
                    </ScrollArea>
                    <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-primary/20 blur-[60px] rounded-full" />
                  </div>
                )}
              </div>
              
              <div className="absolute inset-y-0 -left-16 flex items-center">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-white/40 hover:text-white"
                  onClick={() => setSelectedImage((prev) => (prev! > 0 ? prev! - 1 : activeImageList.length - 1))}
                >
                  <ChevronLeft className="w-12 h-12" />
                </Button>
              </div>
              
              <div className="absolute inset-y-0 -right-16 flex items-center">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-white/40 hover:text-white"
                  onClick={() => setSelectedImage((prev) => (prev! < activeImageList.length - 1 ? prev! + 1 : 0))}
                >
                  <ChevronRight className="w-12 h-12" />
                </Button>
              </div>

              <div className="text-center">
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                  Image {selectedImage + 1} of {results.length} • {location} • {outfit}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-glass border border-glass-border p-8 rounded-3xl max-w-sm w-full shadow-2xl backdrop-blur-2xl text-center space-y-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {deleteConfirm.type === 'clear-all' ? 'Clear Session?' : 'Delete Photo?'}
                </h3>
                <p className="text-text-dim text-sm">
                  {deleteConfirm.type === 'cloud' 
                    ? "This will permanently remove the photo from your cloud gallery. This action cannot be undone."
                    : deleteConfirm.type === 'clear-all'
                    ? "This will remove all current session results. Photos already saved to your gallery will remain safe."
                    : "This will remove the photo from your current session results."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <Button 
                  variant="ghost" 
                  className="bg-white/5 hover:bg-white/10 text-white font-bold h-12 rounded-xl"
                  onClick={() => setDeleteConfirm(null)}
                >
                  CANCEL
                </Button>
                <Button 
                  className="bg-red-500 hover:bg-red-600 text-white font-bold h-12 rounded-xl"
                  onClick={() => {
                    if (deleteConfirm.type === 'local') {
                      handleDeleteLocalImage(deleteConfirm.id as number);
                    } else if (deleteConfirm.type === 'clear-all') {
                      handleClearAllLocal();
                    } else {
                      handleDeleteCloudImage(deleteConfirm.id as string);
                      setSelectedImage(null);
                    }
                    setDeleteConfirm(null);
                  }}
                >
                  {deleteConfirm.type === 'clear-all' ? 'CLEAR ALL' : 'DELETE'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prompt Delete Confirmation Modal */}
      <AnimatePresence>
        {promptDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPromptDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-glass border border-glass-border p-8 rounded-3xl max-w-sm w-full shadow-2xl backdrop-blur-2xl text-center space-y-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Delete Log?</h3>
                <p className="text-text-dim text-sm">
                  {promptDeleteConfirm.type === 'cloud' 
                    ? "This will permanently remove this record from your cloud history. This action cannot be undone."
                    : "This will remove this record from your session logs."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <Button 
                  variant="ghost" 
                  className="bg-white/5 hover:bg-white/10 text-white font-bold h-12 rounded-xl"
                  onClick={() => setPromptDeleteConfirm(null)}
                >
                  CANCEL
                </Button>
                <Button 
                  className="bg-red-500 hover:bg-red-600 text-white font-bold h-12 rounded-xl"
                  onClick={() => {
                    handleDeletePrompt(promptDeleteConfirm.id, promptDeleteConfirm.type);
                    setPromptDeleteConfirm(null);
                  }}
                >
                  DELETE
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* Top Up Modal */}
        {isTopUpOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
            onClick={() => setIsTopUpOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#0a0a0a] border border-white/10 p-8 rounded-[32px] max-w-sm w-full shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 right-0 p-4">
                <button onClick={() => setIsTopUpOpen(false)} className="text-white/20 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight uppercase">Top Up Credits</h3>
                  <p className="text-text-dim text-xs mt-2 uppercase tracking-widest font-bold">Manual approval required by developer</p>
                </div>

                <div className="relative group">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                  <input 
                    type="number"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    placeholder="ENTER CREDIT AMOUNT"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-center text-xl font-black focus:outline-none focus:border-primary transition-all placeholder:text-white/5"
                  />
                </div>

                <Button 
                  className="w-full bg-primary hover:bg-primary/90 text-black font-black h-14 rounded-2xl text-[12px] tracking-[0.2em] uppercase"
                  disabled={!topUpAmount || isNaN(Number(topUpAmount)) || Number(topUpAmount) <= 0}
                  onClick={() => setIsTopUpConfirmOpen(true)}
                >
                  Request Top Up
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Top Up Confirmation */}
        {isTopUpConfirmOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-primary/20 p-10 rounded-[40px] max-w-md w-full text-center space-y-8"
            >
              <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-10 h-10" />
              </div>
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Are you sure?</h3>
                <p className="text-text-dim text-sm leading-relaxed">
                  You are requesting <span className="text-primary font-black">{Number(topUpAmount).toLocaleString()} CREDITS</span>. 
                  This request will be sent to the developer for manual verification and approval.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Button 
                  variant="ghost" 
                  className="bg-white/5 hover:bg-white/10 text-white font-black h-14 rounded-2xl uppercase tracking-widest text-[10px]"
                  onClick={() => setIsTopUpConfirmOpen(false)}
                >
                  Go Back
                </Button>
                <Button 
                  className="bg-primary hover:bg-primary/90 text-black font-black h-14 rounded-2xl uppercase tracking-widest text-[10px]"
                  onClick={handleTopUpRequest}
                  disabled={topUpLoading}
                >
                  {topUpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "YES, PROCEED"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Top Up Success Message */}
        <AnimatePresence>
          {topUpSuccess && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[200]"
            >
              <div className="bg-primary/20 backdrop-blur-xl border border-primary/50 text-white px-8 py-4 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.5)] flex items-center gap-4">
                <div className="bg-primary text-black rounded-full p-2">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[12px] font-black uppercase tracking-widest text-primary">Operation Successful</p>
                  <p className="text-[10px] font-medium opacity-80 uppercase tracking-tight">{topUpSuccess}</p>
                </div>
                <button 
                  onClick={() => setTopUpSuccess(null)}
                  className="ml-4 hover:scale-110 transition-transform text-white/40 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Admin Management Panel */}
        {isAdminPanelOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl"
            onClick={() => setIsAdminPanelOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0a0a0a] border border-white/10 p-10 rounded-[40px] max-w-2xl w-full max-h-[85vh] flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-4">
                    <Target className="w-8 h-8 text-secondary" />
                    Admin Command
                  </h3>
                  <p className="text-text-dim text-[10px] uppercase tracking-[0.3em] font-bold mt-2">Managing Pending Credit Allocations</p>
                </div>
                <button onClick={() => setIsAdminPanelOpen(false)} className="bg-white/5 hover:bg-white/10 text-white/50 w-12 h-12 rounded-2xl flex items-center justify-center transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4">
                  {pendingRequests.length === 0 ? (
                    <div className="text-center py-20 bg-white/5 rounded-[32px] border border-dashed border-white/10">
                      <Clock className="w-12 h-12 text-white/10 mx-auto mb-4" />
                      <p className="text-white/20 font-black uppercase tracking-widest text-xs">No pending requests</p>
                    </div>
                  ) : (
                    pendingRequests.map(req => (
                      <div 
                        key={req.id} 
                        className={cn(
                          "p-6 rounded-[28px] border transition-all flex items-center justify-between group",
                          req.status === 'pending' ? "bg-white/5 border-white/10" : "bg-black/40 border-white/5 opacity-50"
                        )}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <span className="text-[14px] font-black text-white">{req.displayName}</span>
                            <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{req.amount} CR</span>
                          </div>
                          <p className="text-[10px] text-text-dim uppercase tracking-wider">{req.userEmail}</p>
                          <p className="text-[8px] text-text-dim/50 uppercase">{req.timestamp?.toDate().toLocaleString() || 'Just now'}</p>
                        </div>

                        {req.status === 'pending' ? (
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => handleRejectTopUp(req.id)}
                              className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all active:scale-95"
                            >
                              <Ban className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => handleApproveTopUp(req)}
                              className="w-[100px] h-12 rounded-2xl bg-[#00ff88]/10 text-[#00ff88] flex items-center justify-center gap-2 hover:bg-[#00ff88] hover:text-black font-black text-[10px] transition-all active:scale-95 uppercase tracking-widest"
                            >
                              <Check className="w-4 h-4" />
                              Approve
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {req.status === 'approved' ? (
                              <div className="flex items-center gap-2 text-[#00ff88] text-[9px] font-black uppercase tracking-widest bg-[#00ff88]/10 px-4 py-2 rounded-full">
                                <Check className="w-3.5 h-3.5" />
                                PROCESSED
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-red-500 text-[9px] font-black uppercase tracking-widest bg-red-500/10 px-4 py-2 rounded-full">
                                <Ban className="w-3.5 h-3.5" />
                                REJECTED
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              
              <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between">
                <div className="text-[10px] text-text-dim uppercase tracking-widest font-bold">Total Operations History: {pendingRequests.length}</div>
                <div className="text-[10px] text-secondary font-black uppercase tracking-widest">Global Admin Access Enabled</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t border-glass-border py-12 mt-12 bg-glass/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-extrabold tracking-tighter uppercase bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              PONS AI
            </h1>
          </div>
          <div className="flex gap-8 text-[10px] uppercase tracking-widest text-text-dim">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">API Status</a>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-text-dim">
            © 2026 PONS AI STUDIO. ALL RIGHTS RESERVED.
          </p>
        </div>
      </footer>
    </div>
  );
}

