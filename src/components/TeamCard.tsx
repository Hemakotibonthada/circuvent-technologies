"use client";

import { motion } from "framer-motion";
import { Linkedin, Github, Twitter } from "lucide-react";

export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  avatar: string;
  gradient: string;
  socials: {
    linkedin?: string;
    github?: string;
    twitter?: string;
  };
}

interface TeamCardProps {
  member: TeamMember;
  index: number;
}

export default function TeamCard({ member, index }: TeamCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        duration: 0.5,
        delay: index * 0.15,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ y: -8 }}
      className="group relative"
    >
      {/* Hover glow */}
      <div
        className={`absolute -inset-[1px] rounded-3xl bg-gradient-to-r ${member.gradient} opacity-0 group-hover:opacity-20 transition-opacity duration-500 blur-sm`}
      />

      <div
        className="relative overflow-hidden rounded-3xl backdrop-blur-xl p-8 text-center transition-all duration-300"
        style={{
          background: "var(--bg-glass)",
          border: "1px solid var(--border-primary)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* Avatar */}
        <motion.div
          className="relative w-28 h-28 mx-auto mb-6"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <div
            className={`absolute inset-0 rounded-full bg-gradient-to-br ${member.gradient} opacity-30 blur-xl group-hover:opacity-50 transition-opacity duration-500`}
          />
          <div
            className="relative w-full h-full rounded-full flex items-center justify-center overflow-hidden"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-hover)",
            }}
          >
            {member.avatar ? (
              <span className="text-4xl">{member.avatar}</span>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-cyan-500/20 to-violet-500/20" />
            )}
          </div>
          {/* Status ring */}
          <div
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center"
            style={{ border: "4px solid var(--bg-primary)" }}
          >
            <div className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
          </div>
        </motion.div>

        {/* Info */}
        <h3
          className="text-lg font-bold mb-1 group-hover:bg-gradient-to-r group-hover:from-cyan-500 group-hover:to-violet-500 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300"
          style={{ color: "var(--text-primary)" }}
        >
          {member.name}
        </h3>
        <p className="text-sm font-medium mb-4" style={{ color: "var(--text-tertiary)" }}>{member.role}</p>
        <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-muted)" }}>
          {member.bio}
        </p>

        {/* Socials */}
        <div className="flex items-center justify-center gap-3">
          {member.socials.linkedin && (
            <motion.a
              whileHover={{ scale: 1.1, y: -2 }}
              whileTap={{ scale: 0.95 }}
              href={member.socials.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl transition-all duration-300 hover:text-[#0077B5] hover:bg-[#0077B5]/10"
              style={{
                background: "var(--accent-cyan-muted)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-muted)",
              }}
              aria-label={`${member.name} LinkedIn`}
            >
              <Linkedin className="w-4 h-4" />
            </motion.a>
          )}
          {member.socials.github && (
            <motion.a
              whileHover={{ scale: 1.1, y: -2 }}
              whileTap={{ scale: 0.95 }}
              href={member.socials.github}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl transition-all duration-300 hover:text-[var(--text-primary)]"
              style={{
                background: "var(--accent-cyan-muted)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-muted)",
              }}
              aria-label={`${member.name} GitHub`}
            >
              <Github className="w-4 h-4" />
            </motion.a>
          )}
          {member.socials.twitter && (
            <motion.a
              whileHover={{ scale: 1.1, y: -2 }}
              whileTap={{ scale: 0.95 }}
              href={member.socials.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl transition-all duration-300 hover:text-[#1DA1F2] hover:bg-[#1DA1F2]/10"
              style={{
                background: "var(--accent-cyan-muted)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-muted)",
              }}
              aria-label={`${member.name} Twitter`}
            >
              <Twitter className="w-4 h-4" />
            </motion.a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
