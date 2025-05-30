import type { NextApiRequest, NextApiResponse } from 'next';
import { Redis } from '@upstash/redis';

// Create Redis client
const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
});

// Constants
const DEFAULT_REPO = process.env.DEFAULT_REPO_URL || 'https://github.com/reboosty/reboosty';
const CACHE_CONTROL_MAX_AGE = parseInt(process.env.CACHE_CONTROL_MAX_AGE || '3600', 10); // 1 hour as default
const SELECTED_PREFIX = 'selected_for:';
const SELECTED_REPO_TTL = parseInt(process.env.SELECTED_REPO_TTL || '60', 10) * 60; // 1 hour as default
const ALL_REPOS_CACHE_KEY = 'all_repos_cache';
const ALL_REPOS_CACHE_TTL = parseInt(process.env.ALL_REPOS_CACHE_TTL || '15', 10) * 60; // 15 min as default

// Pre-compiled SVG template
const createSvg = (repoName: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100"><defs><filter id="a" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="0" dy="8" stdDeviation="4" flood-color="#000" flood-opacity=".15"/></filter></defs><rect x="10" y="10" width="300" height="80" rx="12" ry="12" fill="#E3F2FD" filter="url(#a)"/><g stroke="#0288D1" stroke-width="2" fill="#0288D1"><circle cx="25" cy="70" r="2"/><circle cx="40" cy="63" r="2"/><circle cx="40" cy="77" r="2"/><path d="M25 70 L40 63 M25 70 L40 77"/></g><text x="160" y="35" fill="#1E3A8A" font-family="monospace" font-weight="bold" font-size="18" text-anchor="middle" dominant-baseline="middle">${repoName}</text><text x="160" y="70" fill="#0288D1" font-family="monospace" font-style="italic" font-size="10" text-anchor="middle" dominant-baseline="middle" letter-spacing="1.5">Reboosty: Branch Out. Be Seen.</text></svg>`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        let repoUrl = (req.query.repo_url as string) || DEFAULT_REPO;

        // Validate the repo URL format
        if (! /^https:\/\/github\.com\/[^\/\s]+\/[^\/\s]+$/.test(repoUrl)) {
            repoUrl = DEFAULT_REPO;
        }
        
        const acceptHeader = req.headers['accept'] || '';
    
        // Redirect for browser requests
        if (acceptHeader.includes('text/html')) {
            const selected = await redis.get<string>(`${SELECTED_PREFIX}${repoUrl}`) || DEFAULT_REPO;
            res.writeHead(302, {
                Location: selected,
                'Cache-Control': 'no-store',
                Vary: 'Accept',
            });
            res.end();
            return;
        }
    
        // Check if we already have a selected repo for this URL
        let selected = await redis.get<string>(`${SELECTED_PREFIX}${repoUrl}`);
    
        if (! selected) {
            // Get all repos from cache
            let allRepos = await redis.get<string[]>(ALL_REPOS_CACHE_KEY);
    
            if (! allRepos) {
                // If cache miss, get all keys with SELECTED_PREFIX
                const selectedKeys = await redis.keys(`${SELECTED_PREFIX}*`);
                
                if (selectedKeys.length > 0) {
                    const repos = selectedKeys.map(key => key.replace(SELECTED_PREFIX, ''));
                    
                    // Filter out null ones and create unique array
                    allRepos = [...new Set(repos)];
                } else {
                    allRepos = [];
                }
                
                // Include the default repo if not already present
                if (! allRepos.includes(DEFAULT_REPO)) {
                    allRepos.push(DEFAULT_REPO);
                }
            
                // Cache the repo list
                if (allRepos.length > 0) {
                    await redis.set(ALL_REPOS_CACHE_KEY, allRepos, { ex: ALL_REPOS_CACHE_TTL });
                }
            }
    
            // Select a random repo or set to default
            if (allRepos && allRepos.length > 0) {
                selected = allRepos[Math.floor(Math.random() * allRepos.length)];
            } else {
                selected = DEFAULT_REPO;
            }
    
            // Cache the selection
            await redis.set(`${SELECTED_PREFIX}${repoUrl}`, selected, { ex: SELECTED_REPO_TTL });
        }
    
        // Extract repo name efficiently
        const repoName = selected.split('/').pop() || 'reboosty';
    
        // Generate optimized SVG
        const svg = createSvg(repoName);
    
        // Set headers efficiently
        res.setHeader('Content-Type', 'image/svg+xml');
        // res.setHeader('Cache-Control',
        //     `public, max-age=${CACHE_CONTROL_MAX_AGE}, s-maxage=${CACHE_CONTROL_MAX_AGE}, stale-while-revalidate=60`
        // );
        res.setHeader('Cache-Control', 'public, max-age=0');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'none'; style-src 'unsafe-inline'; img-src *; font-src *;"
        );
    
        return res.status(200).send(svg);
    } catch (error) {
        // Fallback to default SVG in case of errors
        const svg = createSvg('reboosty');
        res.setHeader('Content-Type', 'image/svg+xml');

        return res.status(200).send(svg);
    }
}