'use client';

import { motion, easeInOut, easeOut } from 'framer-motion';
import { ArrowUpRight, Activity, Building2, Scale, UtensilsCrossed, ShoppingBag, GraduationCap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/Header';

const industrySolutions = [
  {
    name: "Healthcare",
    icon: Activity,
    features: ["24/7 appointment triage", "Insurance validation", "Hindi + English intake"],
    href: "/resources/healthcare",
  },
  {
    name: "Real Estate",
    icon: Building2,
    features: ["Property matcher", "Site visit scheduling", "Lead nurturing"],
    href: "/resources/real-estate",
  },
  {
    name: "Legal",
    icon: Scale,
    features: ["Matter intake", "Clause lookup", "Status tracking"],
    href: "/resources/legal",
  },
  {
    name: "Hospitality",
    icon: UtensilsCrossed,
    features: ["Concierge support", "Event enquiries", "Feedback capture"],
    href: "/resources/hospitality",
  },
  {
    name: "E-Commerce",
    icon: ShoppingBag,
    features: ["Cart recovery", "Product finders", "Order tracking"],
    href: "/resources/ecommerce",
  },
  {
    name: "Education",
    icon: GraduationCap,
    features: ["Admission counselling", "Course catalog", "Fee reminders"],
    href: "/resources/education",
  },
];

const caseStudies = [
  {
    company: "MediCare Hospital",
    location: "Mumbai",
    industry: "Healthcare",
    challenge: "Missed 60% of appointment calls after hours.",
    solution: "Deployed ELEVATE with 24/7 booking.",
    results: ["40% increase in bookings", "₹15L revenue/quarter", "95% patient satisfaction"],
    testimonial: "Our patients love the Hindi support. Bookings are up 40% and our staff is less overwhelmed.",
    author: "Dr. Priya Sharma, CMO",
    image: "https://images.unsplash.com/photo-1580281657527-47f249e8f3c2?auto=format&fit=crop&w=1200&q=80",
  },
  {
    company: "FashionHub",
    location: "Delhi",
    industry: "E-Commerce",
    challenge: "70% cart abandonment rate on mobile.",
    solution: "Implemented SCALE with WhatsApp recovery.",
    results: ["50% less abandonment", "8x lead capture", "₹25L recovered revenue"],
    testimonial: "The chatbot pays for itself 10x over. Our customers actually compliment the shopping experience.",
    author: "Rajesh Malhotra, Founder",
    image: "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80",
  },
  {
    company: "LegalEase Firm",
    location: "Bangalore",
    industry: "Legal Services",
    challenge: "High volume of repetitive client queries.",
    solution: "Integrated BitB for document automation.",
    results: ["70% fewer routine calls", "24/7 client intake", "3x faster case filing"],
    testimonial: "It's like having a junior associate who never sleeps. Our efficiency has skyrocketed.",
    author: "Anjali Desai, Partner",
    image: "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&w=1200&q=80",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeInOut } }
};

export default function CaseStudiesPage() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans">
      <Header />
      
      <main className="pt-32 pb-20 px-6 md:px-12 max-w-[1600px] mx-auto">
        {/* Hero Section */}
        <motion.section 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: easeInOut }}
          className="mb-32"
        >
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-8 leading-[0.9]">
            Impact <br />
            <span className="text-white/40">Stories.</span>
          </h1>
          <p className="text-xl md:text-2xl text-white/60 max-w-2xl leading-relaxed">
            Real results from ambitious Indian businesses. 
            See how BitB transforms customer conversations into revenue.
          </p>
        </motion.section>

        {/* Case Studies - Editorial Layout */}
        <section className="space-y-32 mb-40">
          {caseStudies.map((study, index) => (
            <motion.div 
              key={study.company}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.7, ease: easeOut }}
              className={`flex flex-col ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-12 lg:gap-24 items-center`}
            >
              {/* Image Side */}
              <div className="w-full lg:w-1/2 relative aspect-[4/3] overflow-hidden group">
                <div className="absolute inset-0 bg-white/5 z-10 group-hover:bg-transparent transition-colors duration-500" />
                <Image 
                  src={study.image} 
                  alt={study.company}
                  fill
                  className="object-cover grayscale group-hover:grayscale-0 transition-all duration-700 scale-100 group-hover:scale-105"
                />
                <div className="absolute bottom-0 left-0 p-6 z-20">
                  <div className="bg-black/80 backdrop-blur-md px-4 py-2 border border-white/10 inline-block">
                    <span className="text-sm font-mono uppercase tracking-widest">{study.industry}</span>
                  </div>
                </div>
              </div>

              {/* Content Side */}
              <div className="w-full lg:w-1/2 space-y-8">
                <div>
                  <h2 className="text-4xl md:text-5xl font-bold mb-2">{study.company}</h2>
                  <p className="text-white/40 text-lg">{study.location}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-white/10 pt-8">
                  <div>
                    <h3 className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2">The Challenge</h3>
                    <p className="text-lg leading-relaxed">{study.challenge}</p>
                  </div>
                  <div>
                    <h3 className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2">The Solution</h3>
                    <p className="text-lg leading-relaxed">{study.solution}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs uppercase tracking-[0.2em] text-white/40">Key Results</h3>
                  <div className="flex flex-wrap gap-3">
                    {study.results.map((result) => (
                      <span key={result} className="px-4 py-2 border border-white/20 rounded-full text-sm hover:bg-white hover:text-black transition-colors cursor-default">
                        {result}
                      </span>
                    ))}
                  </div>
                </div>

                <blockquote className="border-l-2 border-white/20 pl-6 italic text-white/70 text-lg">
                  "{study.testimonial}"
                  <footer className="text-sm text-white/40 mt-2 not-italic">— {study.author}</footer>
                </blockquote>
              </div>
            </motion.div>
          ))}
        </section>

        {/* Industry Solutions - Grid Layout */}
        <section>
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-white/10 pb-8">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight">Sector Expertise</h2>
            <p className="text-white/50 mt-4 md:mt-0">Tailored intelligence for every vertical.</p>
          </div>

          <motion.div 
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10"
          >
            {industrySolutions.map((solution) => (
              <motion.div 
                key={solution.name}
                variants={item}
                className="bg-black p-8 md:p-12 hover:bg-white/5 transition-colors duration-300 group relative overflow-hidden"
              >
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowUpRight className="w-6 h-6 text-white/40" />
                </div>
                
                <solution.icon className="w-10 h-10 mb-6 text-white group-hover:scale-110 transition-transform duration-300" strokeWidth={1.5} />
                
                <h3 className="text-2xl font-bold mb-4">{solution.name}</h3>
                
                <ul className="space-y-3 mb-8">
                  {solution.features.map((feature) => (
                    <li key={feature} className="text-white/60 text-sm flex items-center gap-2">
                      <span className="w-1 h-1 bg-white/40 rounded-full" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link 
                  href={solution.href}
                  className="inline-flex items-center text-sm font-bold uppercase tracking-wider border-b border-white/20 pb-1 hover:border-white transition-colors"
                >
                  Explore Solution
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </section>
      </main>
    </div>
  );
}
