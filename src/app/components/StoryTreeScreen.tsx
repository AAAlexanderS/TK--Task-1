import React, { useState, useRef } from 'react';
import { ChevronLeft, Check, Plus, BarChart2, SlidersHorizontal, Star, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import confetti from 'canvas-confetti';
import exampleImage from 'figma:asset/a7063e909f109686309b8da8fd52274ef95cd257.png';
import { ModelPopup, VideoParamsPopup, modelLabel } from './VideoSettingsPopups';

interface StoryTreeScreenProps {
  onBack: () => void;
  onCancel: () => void;
  onGenerated: () => void;
}

export function StoryTreeScreen({ onBack, onCancel, onGenerated }: StoryTreeScreenProps) {
  const [selectedNode, setSelectedNode] = useState('heart');
  const [promptText, setPromptText] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const paramsBtnRef = useRef<HTMLButtonElement>(null);
  const [selectedModel, setSelectedModel] = useState('seedance2');
  const [videoRatio, setVideoRatio] = useState('9:16');
  const [videoDuration, setVideoDuration] = useState('15s');
  const [showModelPopup, setShowModelPopup] = useState(false);
  const [showParamsPopup, setShowParamsPopup] = useState(false);

  const handleRelay = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FE2C55', '#FFFFFF', '#FACC15'],
      zIndex: 1000
    });
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setUploadedImage(null);
      setPromptText('');
      onGenerated(); // Navigate to result screen
    }, 4000);
  };

  // SVG lines to connect the nodes
  const TreeLines = () => (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ minHeight: '500px' }}>
      {/* Root to Left/Right */}
      <path d="M196 150 C196 170, 110 180, 110 200" stroke="#333" strokeWidth="2" fill="none" />
      <path d="M196 150 C196 170, 282 180, 282 200" stroke="#333" strokeWidth="2" fill="none" />
      
      {/* Left Branch */}
      <path d="M110 248 C110 268, 110 270, 110 290" stroke="#333" strokeWidth="2" fill="none" />
      <path d="M110 338 C110 358, 110 360, 110 380" stroke="#333" strokeWidth="2" fill="none" />
      
      {/* Right Branch */}
      <path d="M282 248 C282 268, 282 270, 282 290" stroke="#333" strokeWidth="2" fill="none" />
      <path d="M282 338 C282 358, 282 360, 282 380" stroke="#333" strokeWidth="2" strokeDasharray="4 4" fill="none" />
    </svg>
  );

  return (
    <div className="absolute inset-0 bg-[#0D0D0D] z-50 flex flex-col" style={{ fontFamily: "'PingFang SC', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 500 }}>
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
              爆款正在生成
              <span className="inline-block w-6 text-left">...</span>
            </motion.div>
            <div className="mt-4 text-white/50 text-[13px] font-medium">预计需要 15-30 秒</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 h-12 pt-[env(safe-area-inset-top)]">
        <button onClick={onBack} className="p-2 -ml-2 text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="text-white font-semibold text-[17px]">选择接力节点</span>
        <div className="w-10"></div> {/* Placeholder to keep title centered */}
      </div>

      {/* Section Label */}
      <div className="px-5 mt-4 flex items-center space-x-2 text-[13px] text-white/90">
        <span>🌳</span>
        <span>故事树 · 雪山板鸭救狐狸</span>
      </div>

      {/* Main Content - Tree */}
      <div className="flex-1 relative mt-6 overflow-y-auto no-scrollbar pb-[280px]">
        <TreeLines />
        
        <div className="relative z-10 w-full flex flex-col items-center">
          
          {/* ROOT NODE */}
          <div className="flex flex-col items-center">
            <div className="w-[160px] h-[52px] bg-[#534AB7] rounded-[12px] flex items-center justify-center shadow-[0_4px_12px_rgba(83,74,183,0.3)]">
              <span className="text-white text-[13px] font-bold tracking-wide">🎬 原视频</span>
            </div>
            <span className="text-white/50 text-[10px] mt-1.5">234万播放</span>
          </div>

          <div className="w-full flex justify-between px-5 mt-[30px]">
            {/* LEFT BRANCH */}
            <div className="flex flex-col items-center flex-1">
              <div className="relative">
                <div className="absolute -top-3 -right-2 bg-[#FE2C55] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full z-10 border border-[#0D0D0D]">
                  🔥 热门 89w
                </div>
                <div 
                  onClick={() => setSelectedNode('revenge')}
                  className={`w-[140px] h-[48px] rounded-[12px] flex items-center justify-center cursor-pointer transition-all border-2
                    ${selectedNode === 'revenge' ? 'border-[#534AB7] shadow-[0_0_12px_rgba(83,74,183,0.5)]' : 'border-[#EF9F27] bg-[#EF9F27]/10'}`}
                >
                  <span className="text-[#EF9F27] text-[13px] font-medium">🦊 狐狸真实身份</span>
                  {selectedNode === 'revenge' && (
                    <div className="absolute -right-2 -bottom-2 bg-[#534AB7] rounded-full p-0.5 border-2 border-[#0D0D0D]">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Left Sub Node 1 */}
              <div 
                onClick={() => setSelectedNode('music')}
                className={`w-[140px] h-[48px] rounded-[12px] flex items-center justify-center cursor-pointer transition-all border mt-[42px] relative
                  ${selectedNode === 'music' ? 'border-2 border-[#534AB7] shadow-[0_0_12px_rgba(83,74,183,0.5)] bg-[#534AB7]/10' : 'border-white/20 bg-[#1A1A1A]'}`}
              >
                <span className="text-white/90 text-[13px]">🦆 板鸭复仇记 12w</span>
                {selectedNode === 'music' && (
                  <div className="absolute -right-2 -bottom-2 bg-[#534AB7] rounded-full p-0.5 border-2 border-[#0D0D0D]">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>

              {/* Left Sub Node 2 */}
              <div 
                onClick={() => setSelectedNode('apology')}
                className={`w-[140px] h-[48px] rounded-[12px] flex items-center justify-center cursor-pointer transition-all border mt-[42px] relative
                  ${selectedNode === 'apology' ? 'border-2 border-[#534AB7] shadow-[0_0_12px_rgba(83,74,183,0.5)] bg-[#534AB7]/10' : 'border-white/20 bg-[#1A1A1A]'}`}
              >
                <span className="text-white/90 text-[13px]">🧥 鸭绒服救援队 34w</span>
                {selectedNode === 'apology' && (
                  <div className="absolute -right-2 -bottom-2 bg-[#534AB7] rounded-full p-0.5 border-2 border-[#0D0D0D]">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT BRANCH */}
            <div className="flex flex-col items-center flex-1">
              <div 
                onClick={() => setSelectedNode('heart')}
                className={`w-[140px] h-[48px] rounded-[12px] flex items-center justify-center cursor-pointer transition-all border relative
                  ${selectedNode === 'heart' ? 'border-2 border-[#534AB7] shadow-[0_0_15px_rgba(83,74,183,0.6)] bg-[#534AB7]/10' : 'border-white/30 bg-transparent'}`}
              >
                <span className="text-white/90 text-[13px] font-medium">🍲 狐狸吃板鸭 56w</span>
                {selectedNode === 'heart' && (
                  <div className="absolute -right-2 -bottom-2 bg-[#534AB7] rounded-full p-0.5 border-2 border-[#0D0D0D]">
                    <Check className="w-3 h-3 text-white stroke-[3px]" />
                  </div>
                )}
              </div>

              {/* Right Sub Node 1 */}
              <div 
                onClick={() => setSelectedNode('freedom')}
                className={`w-[140px] h-[48px] rounded-[12px] flex items-center justify-center cursor-pointer transition-all border mt-[42px] relative
                  ${selectedNode === 'freedom' ? 'border-2 border-[#534AB7] shadow-[0_0_12px_rgba(83,74,183,0.5)] bg-[#534AB7]/10' : 'border-white/20 bg-[#1A1A1A]'}`}
              >
                <span className="text-white/90 text-[13px]">🏂 鸭鸭滑雪逃生 28w</span>
                {selectedNode === 'freedom' && (
                  <div className="absolute -right-2 -bottom-2 bg-[#534AB7] rounded-full p-0.5 border-2 border-[#0D0D0D]">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>

              {/* Right Sub Node 2 (New Relay) */}
              <div 
                onClick={() => setSelectedNode('new')}
                className={`w-[140px] h-[48px] rounded-[12px] flex items-center justify-center cursor-pointer transition-all border border-dashed mt-[42px] relative
                  ${selectedNode === 'new' ? 'border-[#534AB7] bg-[#534AB7]/10' : 'border-white/30 bg-transparent hover:border-white/50'}`}
              >
                <div className="flex items-center space-x-1.5">
                  <div className="relative flex items-center justify-center w-2 h-2">
                    <span className="absolute w-2 h-2 bg-[#534AB7] rounded-full animate-ping opacity-75"></span>
                    <span className="relative w-1.5 h-1.5 bg-[#534AB7] rounded-full"></span>
                  </div>
                  <span className="text-white/70 text-[13px]">+ 在这里接力</span>
                </div>
                {selectedNode === 'new' && (
                  <div className="absolute -right-2 -bottom-2 bg-[#534AB7] rounded-full p-0.5 border-2 border-[#0D0D0D]">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Fixed Area */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#0D0D0D] via-[#0D0D0D_70%] to-transparent pt-20 pb-[env(safe-area-inset-bottom)] flex flex-col items-center pointer-events-none">
        
        <div className="w-full pointer-events-auto flex flex-col items-center pb-2">
          {/* Theme Shortcuts */}
          <div className="w-full px-5 mb-3">
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
              {['狐狸报恩', '板鸭觉醒', '雪山奇遇', '反转结局', '温馨治愈'].map((tag) => (
                <button 
                  key={tag} 
                  onClick={() => setPromptText(prev => prev ? prev + ' ' + tag : tag)}
                  className="whitespace-nowrap px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-[13px] font-medium text-white/90 transition-colors border border-white/5 shadow-sm backdrop-blur-md"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Input Card Component */}
          <div className="px-5 w-full shrink-0">
            <div className="w-full bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 flex flex-col shadow-lg">
              {/* Dashed Box & Textarea Row */}
              <div className="flex gap-3 items-start mb-3">
                {uploadedImage ? (
                  <div className="relative w-[60px] h-[60px] shrink-0 rounded-[16px] overflow-hidden border-[1.5px] border-white/20 pointer-events-auto">
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
                    className="w-[60px] h-[60px] shrink-0 rounded-[16px] border-[1.5px] border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors pointer-events-auto"
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
                  className="w-full bg-transparent text-[15px] font-medium text-white placeholder-white/40 focus:outline-none resize-none h-[60px] leading-relaxed py-1 pointer-events-auto"
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
                  className={`shrink-0 h-[36px] px-4 rounded-full flex items-center justify-center text-[14px] font-semibold text-white tracking-wide ml-2 transition-colors pointer-events-auto ${
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
            
            <div className="text-center mt-4 mb-2 text-[12px] text-white/50 font-medium drop-shadow-md">
              视频每秒消耗8积分，实际消耗与最终输出的视频时长相关
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}