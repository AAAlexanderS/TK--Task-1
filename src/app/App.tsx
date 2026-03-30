import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, Search, Heart, MessageCircle, Star, Share2, Plus, Music, Wifi, Signal, ChevronRight, BarChart2, SlidersHorizontal, Loader2, X, ChevronLeft, Copy, Edit3, Send } from 'lucide-react';
import { ImageWithFallback } from './components/figma/ImageWithFallback';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import profileImage from 'figma:asset/4edcedb3440e464d12391f730e5a21c4ec0233dd.png';
import { StoryTreeScreen } from './components/StoryTreeScreen';
import { ModelPopup, VideoParamsPopup, modelLabel } from './components/VideoSettingsPopups';
import { EmotionHeatmap } from './components/EmotionHeatmap';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'feed' | 'storyTree' | 'result'>('feed');
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(821000);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(41000);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [captionText, setCaptionText] = useState('#搞笑反转 #脑洞大开 狐狸吃板鸭后续来了！点击左下角一键接力~');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('seedance2');
  const [videoRatio, setVideoRatio] = useState('9:16');
  const [videoDuration, setVideoDuration] = useState('15s');
  const [showModelPopup, setShowModelPopup] = useState(false);
  const [showParamsPopup, setShowParamsPopup] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const paramsBtnRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultVideoRef = useRef<HTMLVideoElement>(null);
  const [isResultPlaying, setIsResultPlaying] = useState(false);

  const toggleResultPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = resultVideoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); } else { v.pause(); }
  };
  const [isPlaying, setIsPlaying] = useState(true);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const rafRef = useRef<number>(0);

  const startProgressLoop = () => {
    const tick = () => {
      const v = videoRef.current;
      if (v && v.duration) setVideoProgress(v.currentTime / v.duration);
      rafRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopProgressLoop = () => {
    cancelAnimationFrame(rafRef.current);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const handleSeek = useCallback((ratio: number) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    v.currentTime = ratio * v.duration;
    setVideoProgress(ratio);
  }, []);


  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (currentScreen === 'feed') {
      v.play();
    } else {
      v.pause();
    }
  }, [currentScreen]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (showBottomSheet) {
      v.pause();
    } else if (currentScreen === 'feed') {
      v.play();
    }
  }, [showBottomSheet]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    setShowPlayIcon(true);
    setTimeout(() => setShowPlayIcon(false), 800);
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleRelay = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FE2C55', '#FFFFFF', '#FACC15'],
      zIndex: 1000
    });
    setIsGenerating(true);
    // Simulate generation process
    setTimeout(() => {
      setIsGenerating(false);
      setShowBottomSheet(false);
      setCurrentScreen('result');
    }, 4000);
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
  };

  const handleFavorite = () => {
    setIsFavorited(!isFavorited);
    setFavoriteCount(prev => isFavorited ? prev - 1 : prev + 1);
  };

  const handleFollow = () => {
    setIsFollowing(true);
  };

  const lastTapRef = useRef(0);
  const handleBackgroundTap = () => {
    if (showBottomSheet) {
      setShowBottomSheet(false);
      return;
    }

    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapRef.current;
    if (tapLength < 300 && tapLength > 0) {
      if (!isLiked) handleLike();
    }
    lastTapRef.current = currentTime;
  };

  const formatNumber = (num: number) => {
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    return num.toString();
  };

  return (
    <div className="bg-neutral-900 w-full min-h-screen flex items-center justify-center font-sans antialiased">
      {/* Phone Frame Constraint */}
      <div className="relative w-full max-w-[393px] h-[852px] bg-black text-white overflow-hidden shadow-2xl" style={{ fontFamily: "'PingFang SC', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 500 }}>
        
        {/* Custom Toast Notification */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -20, x: "-50%" }}
              className="absolute top-[env(safe-area-inset-top,44px)] mt-2 left-1/2 z-[999] px-6 py-2.5 bg-black/80 backdrop-blur-md text-white text-[14px] rounded-full whitespace-nowrap"
            >
              {toastMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom Styles */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes marquee {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
          .animate-marquee {
            animation: marquee 8s linear infinite;
          }
          @keyframes spin-slow {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .animate-spin-slow {
            animation: spin-slow 4s linear infinite;
          }
          @keyframes shimmer {
            100% { transform: translateX(200%); }
          }
          .no-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .no-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}} />

        {/* Main Video Background */}
        <div className="absolute inset-0 z-0 bg-black" onClick={handleBackgroundTap}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            loop
            playsInline
            onCanPlay={() => {
              const v = videoRef.current;
              if (!v) return;
              v.volume = 0.5;
              setTimeout(() => { v.play(); setIsPlaying(true); }, 1000);
            }}
            onPlay={() => { setIsPlaying(true); startProgressLoop(); }}
            onPause={() => { setIsPlaying(false); stopProgressLoop(); }}
            onEnded={() => { stopProgressLoop(); setVideoProgress(0); }}
          >
            <source src="/videos/bg-video.mov" type="video/mp4" />
            <source src="/videos/bg-video.mov" type="video/quicktime" />
          </video>
          {/* Play/Pause Button */}
          <motion.button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center z-10 bg-transparent"
            style={{ pointerEvents: 'auto' }}
          >
            <AnimatePresence>
              {(!isPlaying || showPlayIcon) && (
                <motion.div
                  key={isPlaying ? 'play' : 'pause'}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.2 }}
                  transition={{ duration: 0.2 }}
                  className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
                >
                  {isPlaying ? (
                    <svg className="w-7 h-7 text-white fill-white" viewBox="0 0 24 24">
                      <rect x="5" y="4" width="4" height="16" rx="1" />
                      <rect x="15" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg className="w-7 h-7 text-white fill-white ml-1" viewBox="0 0 24 24">
                      <path d="M6 4l14 8-14 8V4z" />
                    </svg>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Overlays */}
        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-[20%] bg-gradient-to-b from-black/50 to-transparent z-10 pointer-events-none" />

        {/* System Status Bar */}
        <div className="absolute top-0 inset-x-0 z-30 flex justify-between items-center px-5 py-3.5 text-[15px] font-semibold drop-shadow-md">
          <span>2:08</span>
          <div className="flex items-center gap-1.5">
            <Signal className="w-[18px] h-[18px] fill-white" />
            <Wifi className="w-4 h-4" />
            <div className="flex items-center gap-1">
              {/* Fake red battery indicating 13% */}
              <div className="w-[22px] h-3 border border-white/60 rounded-[3px] p-[1px] relative flex items-center">
                <div className="h-full w-[13%] bg-[#FE2C55] rounded-[1px]" />
                <div className="absolute -right-[3px] w-[2px] h-1.5 bg-white/60 rounded-r-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Top Navigation */}
        <div className="absolute top-[52px] inset-x-0 z-20 px-5 flex items-center justify-between drop-shadow-md">
          <motion.button whileTap={{ scale: 0.8 }} className="p-1 -ml-1 mr-1">
            <Menu className="w-6 h-6 text-white" strokeWidth={2.5} />
          </motion.button>

          <div className="flex-1 flex justify-center items-center gap-5 text-[16px] font-medium whitespace-nowrap overflow-x-auto no-scrollbar px-3">
            <motion.span whileTap={{ opacity: 0.5 }} className="text-white/80 cursor-pointer">热点</motion.span>
            <motion.span whileTap={{ opacity: 0.5 }} className="text-white/80 cursor-pointer">直播</motion.span>
            <motion.span whileTap={{ opacity: 0.5 }} className="text-white/80 cursor-pointer">同城</motion.span>
            <motion.span whileTap={{ opacity: 0.5 }} className="text-white/80 cursor-pointer relative">
              关注
              <div className="absolute top-1 -right-2.5 w-1.5 h-1.5 bg-[#FE2C55] rounded-full" />
            </motion.span>
            <motion.span whileTap={{ opacity: 0.5 }} className="text-white/80 cursor-pointer">商城</motion.span>
            <div className="relative flex flex-col items-center cursor-pointer">
              <span className="text-white font-bold text-[18px]">推荐</span>
              <motion.div layoutId="nav-indicator" className="absolute -bottom-[8px] w-7 h-[3px] bg-white rounded-full"></motion.div>
            </div>
          </div>
          
          <motion.button whileTap={{ scale: 0.8 }} className="p-1 -mr-1 ml-1">
            <Search className="w-[22px] h-[22px] text-white" strokeWidth={2.5} />
          </motion.button>
        </div>

        {/* Floating Top Right Relay Count */}
        <div className="absolute top-[94px] right-3 z-20">
          <div className="bg-black/30 backdrop-blur-md rounded-full px-2 py-1 flex items-center gap-1 border border-white/10 shadow-sm cursor-pointer hover:bg-black/40 transition-colors" onClick={() => setCurrentScreen('storyTree')}>
            <svg viewBox="0 0 24 24" fill="none" className="w-[10px] h-[10px] text-[#FE2C55]">
              <path d="M17 1l4 4-4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-white text-[10px] font-medium tracking-wide">47个接力</span>
            <ChevronRight className="w-2.5 h-2.5 text-white/70" />
          </div>
        </div>
        
        {/* Right Side Interactions */}
        <div className="absolute right-2.5 bottom-[100px] z-20 flex flex-col items-center space-y-4 pb-2">
          {/* Profile Picture & Follow */}
          <div className="relative w-[48px] h-[48px] mb-5">
            <div className="w-[48px] h-[48px] rounded-full overflow-hidden border-[1.5px] border-white bg-amber-900 shadow-md">
              <ImageWithFallback 
                src={profileImage} 
                alt="Profile" 
                className="w-full h-full object-cover" 
              />
            </div>
            <AnimatePresence>
              {!isFollowing && (
                <motion.button 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  whileTap={{ scale: 0.8 }}
                  onClick={handleFollow}
                  className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-6 h-6 bg-[#FE2C55] rounded-full flex items-center justify-center border-2 border-[#1a1a1a] shadow-sm"
                >
                  <Plus className="w-[14px] h-[14px] text-white stroke-[3px]" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Action Buttons */}
          <motion.button whileTap={{ scale: 0.8 }} onClick={handleLike} className="flex flex-col items-center">
            <motion.div animate={{ scale: isLiked ? [1, 1.2, 1] : 1 }} transition={{ duration: 0.3 }}>
              <Heart className={`w-[36px] h-[36px] drop-shadow-lg transition-colors duration-200 ${isLiked ? 'text-[#FE2C55] fill-[#FE2C55]' : 'text-white fill-white'}`} />
            </motion.div>
            <span className="text-[12px] font-semibold text-white drop-shadow-md mt-0.5">{formatNumber(likeCount)}</span>
          </motion.button>
          
          <motion.button whileTap={{ scale: 0.8 }} className="flex flex-col items-center">
            <MessageCircle className="w-[36px] h-[36px] text-white fill-white drop-shadow-lg" />
            <span className="text-[12px] font-semibold text-white drop-shadow-md mt-0.5">9386</span>
          </motion.button>
          
          <motion.button whileTap={{ scale: 0.8 }} onClick={handleFavorite} className="flex flex-col items-center">
            <motion.div animate={{ scale: isFavorited ? [1, 1.2, 1] : 1 }} transition={{ duration: 0.3 }}>
              <Star className={`w-[36px] h-[36px] drop-shadow-lg transition-colors duration-200 ${isFavorited ? 'text-[#ffb800] fill-[#ffb800]' : 'text-white fill-white'}`} />
            </motion.div>
            <span className="text-[12px] font-semibold text-white drop-shadow-md mt-0.5">{formatNumber(favoriteCount)}</span>
          </motion.button>
          
          <motion.button whileTap={{ scale: 0.8 }} className="flex flex-col items-center">
            <Share2 className="w-[36px] h-[36px] text-white fill-white drop-shadow-lg" />
            <span className="text-[12px] font-semibold text-white drop-shadow-md mt-0.5">6.8万</span>
          </motion.button>

          {/* Spinning Record */}
          <motion.div whileTap={{ scale: 0.9 }} className="mt-8 relative w-[48px] h-[48px] flex items-center justify-center cursor-pointer">
             <div className="absolute inset-0 bg-[#2a2a2a] rounded-full border-[8px] border-[#1a1a1a] animate-spin-slow overflow-hidden flex items-center justify-center shadow-lg">
               <ImageWithFallback 
                 src={profileImage} 
                 alt="Record" 
                 className="w-[60%] h-[60%] object-cover rounded-full" 
               />
             </div>
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 flex items-center justify-center z-10">
                <Music className="w-2.5 h-2.5 text-white animate-pulse drop-shadow-md" />
             </div>
          </motion.div>
        </div>

        {/* Bottom Info and Floating Button */}
        <div className="absolute inset-x-0 bottom-[105px] z-20 pointer-events-none flex flex-col gap-1.5">
          {/* Top Row: Username and Centered Button */}
          <div className="relative w-full flex items-center pl-3.5 mb-0.5 mt-2">
            <h2 className="text-[17px] font-bold drop-shadow-md pointer-events-auto">@雪山救狐狸</h2>
            
            {/* Floating Action Relay Button */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto scale-90 -mt-[1px]">
              <motion.button 
                whileTap={{ scale: 0.95 }}
                animate={{ 
                  boxShadow: ['0 0 0px rgba(254,44,85,0)', '0 0 20px rgba(254,44,85,0.6)', '0 0 0px rgba(254,44,85,0)']
                }}
                transition={{ duration: 2, repeat: Infinity }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBottomSheet(true);
                }}
                className="relative overflow-hidden rounded-full px-4 py-2 flex items-center space-x-1.5 border border-white/20 shadow-lg group" style={{ background: 'rgba(254,44,85,0.85)' }}
              >
                {/* Sweep Light Effect */}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_2.5s_infinite] skew-x-[-20deg]" />
                
                <svg viewBox="0 0 24 24" fill="none" className="w-[14px] h-[14px] text-white relative z-10">
                  <path d="M17 1l4 4-4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-white text-[13px] font-bold tracking-wide relative z-10 drop-shadow-md">接力这条视频</span>
              </motion.button>
            </div>
          </div>

          <div className="w-[72%] pl-3.5 flex flex-col gap-1.5 pointer-events-auto">
            <motion.div 
              layout
              onClick={() => setIsExpanded(!isExpanded)} 
              className="text-[15px] font-medium leading-[1.4] drop-shadow-md cursor-pointer mb-2"
            >
              {isExpanded ? (
                <p>你是否在雪山救过一只酱板鸭 完整纯享版！#酱板鸭#狐狸#反转#反转剧情#搞笑段子。感谢支持！</p>
              ) : (
                <p>
                  你是否在雪山救过一只酱板鸭...{' '}
                  <span className="font-bold hover:underline ml-1">展开</span>
                </p>
              )}
            </motion.div>
            
            <div className="flex items-center space-x-2 mt-1 drop-shadow-md">
              <Music className="w-[14px] h-[14px] shrink-0" />
              <div className="flex-1 overflow-hidden relative h-5 flex items-center">
                <div className="absolute whitespace-nowrap text-[14px] animate-marquee font-medium">
                  原声 - @雪山救狐狸 - 原声 - @雪山救狐狸
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Emotion Heatmap + Progress Bar */}
        {currentScreen === 'feed' && (
          <EmotionHeatmap
            progress={videoProgress}
            onSeek={handleSeek}
          />
        )}

        {/* Bottom Navigation */}
        <div className="absolute bottom-0 inset-x-0 h-[90px] z-40 flex items-start pt-3 justify-between px-3 pb-[env(safe-area-inset-bottom)]" style={{ background: 'linear-gradient(to bottom, transparent 0%, #000 36%)' }}>
          <motion.button whileTap={{ scale: 0.9 }} className="flex-1 flex flex-col items-center justify-center text-white font-bold text-[16px] relative h-10">
            首页
            {/* Active Indicator underneath text */}
            <div className="absolute -bottom-1.5 w-[20px] h-[2.5px] bg-white rounded-full" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} className="flex-1 flex items-center justify-center text-white/60 font-medium text-[16px] h-10">
            朋友
          </motion.button>
          <div className="flex-[1.2] flex justify-center items-center h-10">
            <motion.button whileTap={{ scale: 0.9 }} className="h-[32px] w-[46px] rounded-[10px] border-[2px] border-white/90 flex items-center justify-center bg-transparent relative overflow-hidden">
              <Plus className="w-5 h-5 text-white stroke-[2.5px]" />
            </motion.button>
          </div>
          <motion.button whileTap={{ scale: 0.9 }} className="flex-1 flex items-center justify-center text-white/60 font-medium text-[16px] relative h-10">
            消息
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} className="flex-1 flex items-center justify-center text-white/60 font-medium text-[16px] relative h-10">
            我
          </motion.button>
        </div>

        {/* iOS Home Indicator Bar */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[134px] h-[5px] bg-white rounded-full z-50"></div>

        {/* Bottom Overlay Sheet (Sliding up from bottom) */}
        <AnimatePresence>
          {showBottomSheet && (
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-40"
              onClick={() => setShowBottomSheet(false)}
            />
          )}
          {showBottomSheet && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute bottom-0 inset-x-0 h-auto bg-black rounded-t-[20px] z-50 flex flex-col pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-white/10"
            >
              {/* Drag Handle */}
              <div className="w-full flex justify-center pt-3 pb-3 cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1 bg-white/30 rounded-full" />
              </div>

              {/* Theme Shortcuts */}
              <div className="px-5 mb-3">
                <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
                  {['狐狸报恩', '板鸭觉醒', '雪山奇遇', '反转结局', '温馨治愈'].map((tag) => (
                    <button 
                      key={tag} 
                      onClick={() => setPromptText(prev => prev ? prev + ' ' + tag : tag)}
                      className="whitespace-nowrap px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-[13px] font-medium text-white/90 transition-colors border border-white/5"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt Input Card Component */}
              <div className="px-5 mb-2 w-full shrink-0">
                <div className="w-full bg-[#1c1c1e] border border-white/10 rounded-[24px] p-4 flex flex-col shadow-sm">
                  
                  {/* Node Selector (Jump to Story Tree) */}
                  <div 
                    onClick={() => {
                      setCurrentScreen('storyTree');
                      setShowBottomSheet(false);
                    }}
                    className="flex items-center self-start gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-full mb-3 cursor-pointer transition-colors border border-white/5"
                  >
                    <span className="text-[12px]">🌳</span>
                    <span className="text-[12px] text-white/80 font-medium">接在「狐狸吃板鸭」后面</span>
                    <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                  </div>

                  {/* Dashed Box & Textarea Row */}
                  <div className="flex gap-3 items-start mb-3">
                    {uploadedImage ? (
                      <div className="relative w-[60px] h-[60px] shrink-0 rounded-[16px] overflow-hidden border-[1.5px] border-white/20">
                        <ImageWithFallback src={uploadedImage} alt="Uploaded" className="w-full h-full object-cover" />
                        <button 
                          onClick={() => setUploadedImage(null)}
                          className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ) : (
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-[60px] h-[60px] shrink-0 rounded-[16px] border-[1.5px] border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors"
                      >
                        <Plus className="w-6 h-6 text-white/40 stroke-[2]" />
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = URL.createObjectURL(file);
                          setUploadedImage(url);
                        }
                        e.target.value = '';
                      }}
                    />
                    <textarea 
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      className="w-full bg-transparent text-[15px] font-medium text-white placeholder-white/40 focus:outline-none resize-none h-[60px] leading-relaxed py-1"
                      placeholder="描述你的想法接力二创爆款视频"
                    />
                  </div>
                  
                  {/* Bottom Row in Input: Pills and Relay Button */}
                  <div className="flex items-center justify-between mt-2">
                    {/* Pills Row */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      <button
                        ref={modelBtnRef}
                        onClick={() => { setShowModelPopup(v => !v); setShowParamsPopup(false); }}
                        className="flex items-center justify-center whitespace-nowrap px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] text-white/80 font-medium hover:bg-white/10 transition-colors"
                      >
                        <BarChart2 className="w-3 h-3 mr-0.5 stroke-[2.5]" />
                        {modelLabel(selectedModel)}
                      </button>
                      <button
                        ref={paramsBtnRef}
                        onClick={() => { setShowParamsPopup(v => !v); setShowModelPopup(false); }}
                        className="flex items-center justify-center whitespace-nowrap px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] text-white/80 font-medium hover:bg-white/10 transition-colors"
                      >
                        <SlidersHorizontal className="w-3 h-3 mr-1 stroke-[2.5]" />
                        {videoRatio} <span className="mx-1 text-white/20 text-[9px]">|</span> {videoDuration}
                      </button>
                      <ModelPopup
                        open={showModelPopup}
                        anchorRef={modelBtnRef}
                        value={selectedModel}
                        onChange={setSelectedModel}
                        onClose={() => setShowModelPopup(false)}
                      />
                      <VideoParamsPopup
                        open={showParamsPopup}
                        anchorRef={paramsBtnRef}
                        ratio={videoRatio}
                        duration={videoDuration}
                        onChangeRatio={setVideoRatio}
                        onChangeDuration={setVideoDuration}
                        onClose={() => setShowParamsPopup(false)}
                      />
                    </div>

                    {/* Action Button */}
                    <motion.button 
                      whileTap={{ scale: 0.95 }}
                      onClick={handleRelay}
                      disabled={isGenerating}
                      className={`shrink-0 h-[36px] px-4 rounded-full flex items-center justify-center text-[14px] font-semibold text-white tracking-wide ml-2 transition-colors ${
                        isGenerating ? 'bg-white/20' : 'bg-[#FE2C55]'
                      }`}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Star className="w-4 h-4 mr-1.5 fill-white" />
                          接力
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
                
                <div className="text-center mt-4 mb-8 text-[12px] text-white/50 font-medium">
                  视频每秒消耗8积分，实际消耗与最终输出的视频时长相关
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading Overlay */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[150] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center"
            >
              <div className="relative w-24 h-24 mb-6">
                <div className="absolute inset-0 border-4 border-white/20 rounded-full"></div>
                <motion.div 
                  className="absolute inset-0 border-4 border-[#FE2C55] rounded-full border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Star className="w-8 h-8 text-[#FE2C55] fill-[#FE2C55] animate-pulse" />
                </div>
              </div>
              <motion.div 
                className="text-white text-[18px] font-bold tracking-widest flex items-center"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                爆款视频生成中
                <span className="inline-block w-6 text-left">...</span>
              </motion.div>
              <div className="mt-4 text-white/50 text-[13px] font-medium">预计需要 15-30 秒</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Screen 2: Story Tree */}
        <AnimatePresence>
          {currentScreen === 'storyTree' && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 z-[100]"
            >
              <StoryTreeScreen 
                onBack={() => setCurrentScreen('feed')} 
                onCancel={() => setCurrentScreen('feed')} 
                onGenerated={() => setCurrentScreen('result')}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Screen 3: Generation Result */}
        <AnimatePresence>
          {currentScreen === 'result' && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 z-[100] bg-black"
            >
              {/* Top Bar */}
              <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 pt-[env(safe-area-inset-top,44px)] pb-3 bg-gradient-to-b from-black/50 to-transparent">
                <button 
                  onClick={() => {
                    setCurrentScreen('feed');
                    setUploadedImage(null);
                    setPromptText('');
                  }} 
                  className="p-2 -ml-2 mt-7 rounded-full hover:bg-white/10 transition-colors relative z-20 flex items-center justify-center"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 mt-7 text-[16px] font-medium text-white shadow-sm">生成结果</span>
                <div className="w-10 mt-7"></div> {/* Spacer to balance flex layout */}
              </div>

              {/* Video Background */}
              <div className="absolute inset-0">
                <video
                  ref={resultVideoRef}
                  className="w-full h-full object-cover"
                  loop
                  playsInline
                  onCanPlay={() => { if (resultVideoRef.current) resultVideoRef.current.volume = 0.5; }}
                  onClick={toggleResultPlay}
                  onPlay={() => setIsResultPlaying(true)}
                  onPause={() => setIsResultPlaying(false)}
                >
                  <source src="/videos/result-video.mov" type="video/mp4" />
                  <source src="/videos/result-video.mov" type="video/quicktime" />
                </video>

                {/* Play/Pause Button */}
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <AnimatePresence>
                    {!isResultPlaying && (
                      <motion.button
                        onClick={toggleResultPlay}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.2 }}
                        transition={{ duration: 0.2 }}
                        className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-auto"
                      >
                        <svg className="w-7 h-7 text-white fill-white ml-1" viewBox="0 0 24 24">
                          <path d="M6 4l14 8-14 8V4z" />
                        </svg>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Bottom Actions Container */}
              <div className="absolute bottom-0 inset-x-0 pb-[calc(env(safe-area-inset-bottom,34px)+20px)] pt-20 px-5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end">
                
                {/* Info Text */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full border border-white/20 overflow-hidden">
                      <ImageWithFallback src={profileImage} alt="profile" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-white/90 font-medium text-[15px]">@你的名字</span>
                  </div>
                  <textarea 
                    value={captionText}
                    onChange={(e) => setCaptionText(e.target.value)}
                    className="w-full bg-black/20 backdrop-blur-md border border-white/20 rounded-[12px] p-3 text-white/90 text-[14px] leading-relaxed resize-none focus:outline-none focus:border-white/50 focus:bg-black/40 transition-all shadow-inner"
                    rows={3}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2.5">
                  <button 
                    onClick={() => {
                      setCurrentScreen('feed');
                      setShowBottomSheet(true);
                    }}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-[16px] border border-white/10 flex flex-col items-center justify-center gap-1.5 transition-colors"
                  >
                    <Edit3 className="w-5 h-5 text-white/90" />
                    <span className="text-white/90 text-[12px] font-medium">再编辑</span>
                  </button>
                  <button 
                    onClick={() => {
                      try {
                        navigator.clipboard?.writeText(captionText).catch(() => {});
                      } catch (e) {}
                      showToast('复制成功');
                    }}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-[16px] border border-white/10 flex flex-col items-center justify-center gap-1.5 transition-colors"
                  >
                    <Copy className="w-5 h-5 text-white/90" />
                    <span className="text-white/90 text-[12px] font-medium">提示词复制</span>
                  </button>
                  <button 
                    onClick={() => showToast('链接复制成功')}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-[16px] border border-white/10 flex flex-col items-center justify-center gap-1.5 transition-colors"
                  >
                    <Share2 className="w-5 h-5 text-white/90" />
                    <span className="text-white/90 text-[12px] font-medium">转发</span>
                  </button>
                  <button 
                    onClick={() => {
                      showToast('发布成功');
                      setCurrentScreen('feed');
                      setPromptText('');
                      setCaptionText('#搞笑反转 #脑洞大开 狐狸吃板鸭后续来了！点击左下角一键接力~');
                      setUploadedImage(null);
                    }}
                    className="flex-[1.5] py-3 bg-[#FE2C55] hover:bg-[#E8284C] rounded-[16px] flex flex-col items-center justify-center gap-1.5 transition-colors shadow-[0_4px_12px_rgba(254,44,85,0.3)]"
                  >
                    <Send className="w-5 h-5 text-white" />
                    <span className="text-white text-[14px] font-bold">发布</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}